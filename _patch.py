import io
path = "backend/memory/vector_store.py"
text = io.open(path, encoding="utf-8-sig").read()
lines = text.split("\n")
assert lines[43].startswith("    def __call__"), lines[43]
lines[43] = lines[43].replace("def __call__", "def _embed")
block = [
"",
"    # ChromaDB 1.x 協定要求 embed_documents / embed_query，",
"    # 舊版則使用 __call__，三者皆指向同一實作",
"    def __call__(self, input: Sequence[str]) -> list[list[float]]:",
"        return self._embed(input)",
"",
"    def embed_documents(self, input: Sequence[str]) -> list[list[float]]:",
"        return self._embed(input)",
"",
"    def embed_query(self, input: Sequence[str]) -> list[list[float]]:",
"        return self._embed(input)",
]
