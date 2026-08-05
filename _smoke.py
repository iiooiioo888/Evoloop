import os, tempfile
os.environ.pop("CHROMA_HOST", None)
os.environ["EVOL_CHROMA_DIR"] = tempfile.mkdtemp()

class FakeEF:
    def __call__(self, input):
        return [[float(t.count("a")), float(t.count("b"))] for t in input]
    @staticmethod
    def name():
        return "fake"

from backend.memory.vector_store import VectorMemoryStore
s = VectorMemoryStore(embedding_function=FakeEF())
s.add_memory("aaa", metadata={"score": 9.0, "tag": None, "extra": [1, 2]})
s.add_memory("bbb")
res = s.search_similar("aaaa", k=2)
assert res[0]["text"] == "aaa", res
assert s.count() == 2
removed = s.cleanup(max_age_days=30, min_score=9.5)
assert removed == 1 and s.count() == 1, s.all()
s.reset()
assert s.count() == 0
print("SMOKE OK")
