"""Private native Dock child for the managed Help network regression."""

import json
import os
import sys

import pytest
import uvicorn

from openviking.pyagfs import get_binding_client
from openviking.server.app import create_app
from openviking.server.config import ServerConfig
from openviking.storage.vectordb import engine
from openviking_cli.utils.config.open_viking_config import OpenVikingConfigSingleton
from tests.server.conftest import _install_fake_embedder, _install_fake_vlm


def main():
    os.umask(0o077)
    payload = json.loads(sys.stdin.readline())
    assert get_binding_client()[0] is not None, "Native RagFS is required"
    assert engine.ENGINE_VARIANT != "unavailable", "Native vector engine is required"
    with pytest.MonkeyPatch.context() as patch:
        _install_fake_embedder(patch)
        _install_fake_vlm(patch)
        OpenVikingConfigSingleton.initialize(
            config_dict={
                "storage": {
                    "workspace": payload["workspace"],
                    "agfs": {"backend": "local"},
                    "vectordb": {"backend": "local"},
                },
                "embedding": {
                    "dense": {
                        "provider": "openai",
                        "model": "test-embedder",
                        "api_key": "test-unused",
                        "dimension": 2048,
                    }
                },
                "retrieval": {"enable_intent": False},
            }
        )
        app = create_app(config=ServerConfig(auth_mode="api_key", root_api_key=payload["root_key"]))
        uvicorn.run(
            app, host="127.0.0.1", port=payload["port"], log_level="warning", access_log=False
        )


if __name__ == "__main__":
    main()
