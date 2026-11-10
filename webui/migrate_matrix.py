"""One-time conversion of the original preset columns into a color matrix."""

import json
import sqlite3
from pathlib import Path

HERE = Path(__file__).resolve().parent


def convert(old):
    new = {"schemaVersion": 2, "sourceFile": old.get("sourceFile"), "equipment": {}}
    for kind, branch in old["equipment"].items():
        sets = {}
        for name, group in branch["sets"].items():
            mains = [option["name"] for option in group["mainOptions"]]
            subs = list(dict.fromkeys(option["name"] for preset in group["presets"] for option in preset["subOptions"]))
            enabled = {option["name"] for option in group["mainOptions"] if option["used"]}
            cells = []
            for sub in subs:
                cells.append([
                    main in enabled and any(
                        main in {mark["name"] for mark in preset["upperGreenMarks"]}
                        and any(option["name"] == sub and option["used"] for option in preset["subOptions"])
                        for preset in group["presets"]
                    )
                    for main in mains
                ])
            sets[name] = {"mainOptions": mains, "subOptions": subs, "cells": cells}
        new["equipment"][kind] = {"sets": sets}
    return new


def main():
    seed_path = HERE / "static" / "seed.json"
    seed = json.loads(seed_path.read_text(encoding="utf-8"))
    if seed["schemaVersion"] == 1:
        seed_path.write_text(json.dumps(convert(seed), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    db_path = HERE / "presets.sqlite3"
    if not db_path.exists():
        return
    with sqlite3.connect(db_path) as db:
        revision, content = db.execute("SELECT revision, content FROM app_state WHERE id = 1").fetchone()
        old = json.loads(content)
        if old["schemaVersion"] != 1:
            return
        backup = HERE / "presets-before-matrix.sqlite3"
        if backup.exists():
            raise FileExistsError(backup)
        with sqlite3.connect(backup) as copy:
            db.backup(copy)
        db.execute("UPDATE app_state SET content = ?, revision = ? WHERE id = 1", (json.dumps(convert(old), ensure_ascii=False), revision + 1))
        print(f"기존 DB 백업: {backup}")


if __name__ == "__main__":
    main()
