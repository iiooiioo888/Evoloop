"""Phase 2 向量記憶庫：ChromaDB 封裝（Task 2.1 / 2.3）。

取代 Phase 1 的 JSON 暫存（json_store.py），介面保持一致
（add_memory / search_similar / all / reset），另提供
cleanup 供記憶維護使用。

連線方式：
- 設定 CHROMA_HOST（與 CHROMA_PORT）時使用 HttpClient，
  對應 docker-compose 中的 chroma 服務
- 未設定時使用本地 PersistentClient，目錄可透過
  EVOL_CHROMA_DIR 覆蓋（測試隔離）

嵌入模型走 LiteLLM 統一呼叫層（EVOL_EMBED_MODEL），
可注入自訂 embedding function（測試用，避免真實 API 呼叫）。
"""

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Sequence

from dotenv import load_dotenv
from litellm import embedding

load_dotenv()

logger = logging.getLogger(__name__)

DEFAULT_COLLECTION = "evo_memory"
DEFAULT_EMBED_MODEL = "text-embedding-3-small"

# 預設本地持久目錄：backend/data/chroma
DEFAULT_PERSIST_DIR = Path(__file__).resolve().parent.parent / "data" / "chroma"


class LiteLLMEmbeddingFunction:
    """符合 ChromaDB embedding function 協定的 LiteLLM 包裝。"""

    def __init__(self, model: str | None = None):
        self.model = model or os.getenv("EVOL_EMBED_MODEL", DEFAULT_EMBED_MODEL)

    def __call__(self, input: Sequence[str]) -> list[list[float]]:
        response = embedding(model=self.model, input=list(input))
        return [item["embedding"] for item in response.data]

    @staticmethod
    def name() -> str:
        return "litellm_embedding"


def _sanitize_metadata(metadata: dict | None) -> dict:
    """ChromaDB metadata 僅支援純量型別，過濾 None 並轉換其餘值。"""
    cleaned: dict[str, Any] = {}
    for key, value in (metadata or {}).items():
        if value is None:
            continue
        if isinstance(value, (str, int, float, bool)):
            cleaned[key] = value
        else:
            cleaned[key] = str(value)
    return cleaned


class VectorMemoryStore:
    """以 ChromaDB 儲存的向量記憶庫。

    連線與 collection 皆惰性初始化，匯入本模組不會產生
    外部連線，方便測試替換與離線環境使用。
    """

    def __init__(
        self,
        collection_name: str | None = None,
        embedding_function: Any | None = None,
    ):
        self.collection_name = collection_name or os.getenv(
            "EVOL_CHROMA_COLLECTION", DEFAULT_COLLECTION
        )
        self._embedding_function = embedding_function
        self._client = None
        self._collection = None

    # ---- 連線（惰性） ----

    def _create_client(self):
        import chromadb

        host = os.getenv("CHROMA_HOST")
        port = int(os.getenv("CHROMA_PORT", "8100"))
        if host:
            logger.debug("連接 ChromaDB 伺服器 %s:%s", host, port)
            return chromadb.HttpClient(host=host, port=port)
        persist_dir = Path(os.getenv("EVOL_CHROMA_DIR", str(DEFAULT_PERSIST_DIR)))
        persist_dir.mkdir(parents=True, exist_ok=True)
        logger.debug("使用本地 ChromaDB 持久目錄 %s", persist_dir)
        return chromadb.PersistentClient(path=str(persist_dir))

    def _get_collection(self):
        if self._collection is None:
            if self._client is None:
                self._client = self._create_client()
            if self._embedding_function is None:
                self._embedding_function = LiteLLMEmbeddingFunction()
            self._collection = self._client.get_or_create_collection(
                name=self.collection_name,
                embedding_function=self._embedding_function,
            )
        return self._collection

    # ---- 核心介面 ----

    def add_memory(
        self, text: str, metadata: dict | None = None, memory_id: str | None = None
    ) -> str:
        """新增一筆記憶（文字嵌入後儲存），回傳記錄 ID。"""
        meta = _sanitize_metadata(metadata)
        meta.setdefault("created_at", datetime.now(timezone.utc).isoformat())
        record_id = memory_id or uuid.uuid4().hex
        self._get_collection().add(
            documents=[text], metadatas=[meta], ids=[record_id]
        )
        return record_id

    def search_similar(self, query: str, k: int = 3) -> list[dict]:
        """檢索與查詢最相似的 k 筆記憶。

        回傳 [{"text": ..., "metadata": ..., "distance": ...}, ...]，
        distance 越小越相似；記憶庫為空時回傳空列表。
        """
        collection = self._get_collection()
        total = collection.count()
        if total == 0 or k <= 0:
            return []
        results = collection.query(
            query_texts=[query], n_results=min(k, total)
        )
        memories = []
        for text, meta, distance in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            memories.append({"text": text, "metadata": meta, "distance": distance})
        return memories

    def all(self) -> list[dict]:
        """回傳全部記憶（含 metadata）。"""
        data = self._get_collection().get(include=["metadatas"])
        return [
            {"id": record_id, "text": text, "metadata": meta}
            for record_id, text, meta in zip(
                data["ids"], data["documents"], data["metadatas"]
            )
        ]

    def count(self) -> int:
        """回傳記憶總數。"""
        return self._get_collection().count()

    def reset(self) -> None:
        """清空記憶庫（刪除並重建 collection）。"""
        if self._client is None:
            self._client = self._create_client()
        self._client.delete_collection(self.collection_name)
        self._collection = None
        self._get_collection()

    # ---- 維護（Task 2.3） ----

    def cleanup(self, max_age_days: int = 30, min_score: float | None = None) -> int:
        """刪除過期或低品質記憶，回傳刪除筆數。

        - 過期：created_at 早於 max_age_days 天前
        - 低品質：metadata.score 低於 min_score（有設定時）
        """
        collection = self._get_collection()
        data = collection.get(include=["metadatas"])
        if not data["ids"]:
            return 0

        cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
        stale_ids = []
        for record_id, meta in zip(data["ids"], data["metadatas"]):
            meta = meta or {}
            expired = False
            try:
                created = datetime.fromisoformat(meta.get("created_at", ""))
                expired = created < cutoff
            except (TypeError, ValueError):
                pass
            score = meta.get("score")
            low_quality = (
                min_score is not None
                and isinstance(score, (int, float))
                and score < min_score
            )
            if expired or low_quality:
                stale_ids.append(record_id)

        if stale_ids:
            collection.delete(ids=stale_ids)
        return len(stale_ids)
