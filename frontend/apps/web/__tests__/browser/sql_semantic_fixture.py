"""Independent synthetic SQL oracle; SQLite in memory only, never the application database.

Run from repository root: python frontend/apps/web/__tests__/browser/sql_semantic_fixture.py
The optional generated candidate is read from this test's fixed artifact directory.
This verifies sample results, not PostgreSQL plan quality or general semantic equivalence.
"""
import json
import sqlite3
from pathlib import Path

ARTIFACTS = Path(__file__).parent / "artifacts" / "agent-complex"
CASES = json.loads((ARTIFACTS / "cases.json").read_text(encoding="utf-8"))
CUSTOMERS = [(1, "east"), (2, "east"), (3, "west"), (4, "west"), (5, "east"), (6, "north")]
ORDERS = [(1, 1, "paid", 100), (2, 1, "paid", 50), (3, 2, "cancelled", 999),
          (4, 3, "paid", 200), (5, None, "paid", 10), (6, 4, "paid", None), (7, 3, "paid", 0)]


def database(rows):
    db = sqlite3.connect(":memory:")
    db.executescript("CREATE TABLE customers(id INTEGER PRIMARY KEY, region TEXT);"
                     "CREATE TABLE orders(id INTEGER PRIMARY KEY, customer_id INTEGER, status TEXT, amount INTEGER);")
    db.executemany("INSERT INTO customers VALUES (?,?)", CUSTOMERS)
    db.executemany("INSERT INTO orders VALUES (?,?,?,?)", rows)
    db.commit()
    allowed = {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ, sqlite3.SQLITE_FUNCTION}
    db.set_authorizer(lambda action, arg1, arg2, _db, _source:
                      sqlite3.SQLITE_OK if action in allowed and arg2 != "load_extension" else sqlite3.SQLITE_DENY)
    return db


def expected_unpaid(rows):
    paid = {row[1] for row in rows if row[2] == "paid" and row[1] is not None}
    return [(row[0],) for row in CUSTOMERS if row[0] not in paid]


with database(ORDERS) as db:
    ranked = db.execute(CASES[0]["sql"]).fetchall()
    assert ranked == [(1, "east", 2, 150), (2, "east", 0, 0), (6, "north", 0, 0),
                      (3, "west", 2, 200), (4, "west", 1, 0)], ranked
    original = db.execute(CASES[1]["sql"]).fetchall()
    assert original == []
    assert expected_unpaid(ORDERS) == [(2,), (5,), (6,)]

result = {"engine": "SQLite in-memory synthetic fixture", "productionSqlExecuted": False,
          "cteWindowAggregate": ranked, "originalNotInWithNull": original,
          "intendedUnpaidCustomerIds": expected_unpaid(ORDERS), "candidateChecks": []}
candidate_path = ARTIFACTS / "null-safe-candidate.sql"
if candidate_path.exists():
    candidate = candidate_path.read_text(encoding="utf-8")
    for name, rows in [("null-duplicate-and-null-amount", ORDERS),
                       ("no-null-customer", [row for row in ORDERS if row[1] is not None]),
                       ("empty-orders", []),
                       ("only-null-customer", [(1, None, "paid", 10)])]:
        with database(rows) as db:
            actual = db.execute(candidate).fetchall()
        assert actual == expected_unpaid(rows), (name, actual)
        result["candidateChecks"].append({"case": name, "rows": actual, "passed": True})
(ARTIFACTS / "semantic-oracle.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result, ensure_ascii=False))
