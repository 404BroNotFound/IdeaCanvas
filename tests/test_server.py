"""API tests for the IdeaCanvas Flask backend."""

from __future__ import annotations

import shutil
import unittest
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import server


class IdeaCanvasApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = Path(__file__).parent / ".tmp" / uuid4().hex
        self.temporary_directory.mkdir(parents=True)
        self.board_directory_patch = patch.object(
            server,
            "BOARD_DIRECTORY",
            self.temporary_directory,
        )
        self.board_directory_patch.start()
        self.client = server.app.test_client()

    def tearDown(self) -> None:
        self.board_directory_patch.stop()
        shutil.rmtree(self.temporary_directory)

    def test_health_check(self) -> None:
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["status"], "ok")

    def test_frontend_is_served_without_exposing_backend_source(self) -> None:
        for path in ("/", "/styles.css", "/app.js"):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200)
            response.close()

        blocked_response = self.client.get("/server.py")
        self.assertEqual(blocked_response.status_code, 404)
        blocked_response.close()

    def test_board_round_trip(self) -> None:
        board = {
            "title": "Test board",
            "nodes": [],
            "drawings": [],
            "connections": [],
        }

        save_response = self.client.put("/api/boards/test-board", json=board)
        load_response = self.client.get("/api/boards/test-board")

        self.assertEqual(save_response.status_code, 200)
        self.assertEqual(load_response.status_code, 200)
        self.assertEqual(load_response.get_json()["title"], "Test board")

        list_response = self.client.get("/api/boards")
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.get_json()["boards"][0]["id"], "test-board")
        self.assertEqual(list_response.get_json()["boards"][0]["objectCount"], 0)

        delete_response = self.client.delete("/api/boards/test-board")
        self.assertEqual(delete_response.status_code, 200)
        self.assertEqual(self.client.get("/api/boards/test-board").status_code, 404)

    def test_invalid_board_id_is_rejected(self) -> None:
        response = self.client.put(
            "/api/boards/invalid.id",
            json={"nodes": [], "drawings": [], "connections": []},
        )
        self.assertEqual(response.status_code, 400)

    def test_invalid_payload_is_rejected(self) -> None:
        response = self.client.put("/api/boards/test", json={"nodes": "invalid"})
        self.assertEqual(response.status_code, 400)

    def test_missing_board_returns_not_found(self) -> None:
        response = self.client.get("/api/boards/missing")
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
