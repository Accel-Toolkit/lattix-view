"""The workbench plugin: ``lattix ui`` finds it through the ``lattix.ui.plugins`` entry point and
adds the 3D tab; ``lattix-view view`` passes it to the server directly."""
from __future__ import annotations

from lattix.ui.plugins import UiPlugin, UiTab

from lattix_view._version import __version__
from lattix_view.routes import ROUTES


def register() -> UiPlugin:
    return UiPlugin(name="lattix_view", version=__version__, routes=list(ROUTES),
                    tabs=[UiTab("view3d", "3D", "/", order=50)])
