"""IdeaCanvas Flask application.

Serves the frontend and provides a small JSON API for persistent boards.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from flask import Flask, Response, jsonify, request, send_from_directory


BASE_DIRECTORY = Path(__file__).resolve().parent
BOARD_DIRECTORY = BASE_DIRECTORY / "data" / "boards"
BOARD_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")
MAX_REQUEST_BYTES = 5 * 1024 * 1024
PUBLIC_ASSETS = {"app.js", "styles.css", "logo.svg"}

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = MAX_REQUEST_BYTES
BOARD_DIRECTORY.mkdir(parents=True, exist_ok=True)


def board_path(board_id: str) -> Path:
    """Return a safe storage path for a validated board identifier."""
    if not BOARD_ID_PATTERN.fullmatch(board_id):
        raise ValueError("Board IDs may only contain letters, numbers, hyphens, and underscores.")
    return BOARD_DIRECTORY / f"{board_id}.json"


def valid_board_payload(payload: Any) -> bool:
    """Check the minimum schema expected from the canvas client."""
    if not isinstance(payload, dict):
        return False
    return all(isinstance(payload.get(key, []), list) for key in ("nodes", "drawings", "connections"))


@app.get("/")
def index() -> Response:
    return send_from_directory(BASE_DIRECTORY, "index.html")


@app.get("/<path:filename>")
def frontend_asset(filename: str) -> tuple[Response, int] | Response:
    if filename not in PUBLIC_ASSETS:
        return jsonify({"error": "Not found"}), 404
    return send_from_directory(BASE_DIRECTORY, filename)


@app.get("/api/health")
def health() -> tuple[Response, int]:
    return jsonify({"status": "ok", "service": "IdeaCanvas"}), 200


def board_summary(file_path: Path) -> dict[str, Any]:
    """Return lightweight metadata for the project browser."""
    try:
        board = json.loads(file_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        board = {}
    return {
        "id": file_path.stem,
        "title": board.get("title", "Untitled canvas"),
        "updatedAt": board.get("updatedAt", datetime.fromtimestamp(file_path.stat().st_mtime, timezone.utc).isoformat()),
        "objectCount": len(board.get("nodes", [])) + len(board.get("drawings", [])),
    }


@app.get("/api/boards")
def list_boards() -> tuple[Response, int]:
    boards = [board_summary(path) for path in BOARD_DIRECTORY.glob("*.json")]
    boards.sort(key=lambda board: board["updatedAt"], reverse=True)
    return jsonify({"boards": boards}), 200

@app.get("/api/boards/<board_id>")
def get_board(board_id: str) -> tuple[Response, int] | Response:
    try:
        file_path = board_path(board_id)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    if not file_path.exists():
        return jsonify({"error": "Board not found"}), 404

    return jsonify(json.loads(file_path.read_text(encoding="utf-8")))


@app.put("/api/boards/<board_id>")
def save_board(board_id: str) -> tuple[Response, int]:
    try:
        file_path = board_path(board_id)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    payload = request.get_json(silent=True)
    if not valid_board_payload(payload):
        return jsonify({"error": "Invalid board data"}), 400

    payload["id"] = board_id
    payload["updatedAt"] = datetime.now(timezone.utc).isoformat()
    temporary_path = file_path.with_suffix(".tmp")
    temporary_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    temporary_path.replace(file_path)

    return jsonify({"saved": True, "boardId": board_id}), 200


@app.delete("/api/boards/<board_id>")
def delete_board(board_id: str) -> tuple[Response, int]:
    try:
        file_path = board_path(board_id)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    if not file_path.exists():
        return jsonify({"error": "Board not found"}), 404

    file_path.unlink()
    return jsonify({"deleted": True, "boardId": board_id}), 200


@app.errorhandler(413)
def request_too_large(_error: Exception) -> tuple[Response, int]:
    return jsonify({"error": "Board data exceeds the 5 MB limit"}), 413


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=4173, debug=True)
