"""冒烟测试：验证 VectorMemoryStore 核心功能（add / search / cleanup / reset）。

无需真实 LLM API，使用 Fake 嵌入函数，可在任意环境快速执行。
"""

import os
import tempfile

os.environ.pop("CHROMA_HOST", None)
os.environ["EVOL_CHROMA_DIR"] = tempfile.mkdtemp()


class FakeEF:
    """Fake embedding function，将字符 'a' / 'b' 计数作为二维向量。

    兼容 ChromaDB >= 1.x（embed_query / embed_documents）与旧版（__call__）。
    """

    def _embed(self, input):
        return [[float(t.count("a")), float(t.count("b"))] for t in input]

    def __call__(self, input):
        return self._embed(input)

    def embed_query(self, input):
        return self._embed(input)

    def embed_documents(self, input):
        return self._embed(input)

    @staticmethod
    def name():
        return "fake"


def main() -> None:
    from backend.memory.vector_store import VectorMemoryStore

    store = VectorMemoryStore(embedding_function=FakeEF())

    store.add_memory("aaa", metadata={"score": 9.0, "tag": None, "extra": [1, 2]})
    store.add_memory("bbb")

    res = store.search_similar("aaaa", k=2)
    assert res[0]["text"] == "aaa", res
    assert store.count() == 2

    removed = store.cleanup(max_age_days=30, min_score=9.5)
    assert removed == 1 and store.count() == 1, store.all()

    store.reset()
    assert store.count() == 0

    print("SMOKE OK")


if __name__ == "__main__":
    main()