"""Browser tests: the workbench server with the plugin runs in this process, Chromium renders through
SwiftShader (software WebGL), and every page reports its console errors.  They need the `browser`
extra (`pip install -e ".[browser]" && playwright install chromium`) and the lattix public decks;
without either they skip.  Screenshots and downloads land in `tests/e2e/.artifacts/`."""
from __future__ import annotations

import os
from pathlib import Path

import pytest
from lattix.crossval import DECKS, PUBLIC

ARTIFACTS = Path(__file__).resolve().parent / ".artifacts"
CHROMIUM_ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READY = "window.lattix3d && window.lattix3d.ready"

#: the decks every push renders; the nightly run takes every public deck (LATTIX_VIEW_E2E_ALL=1)
FAST_DECKS = ["helix/csr_chicane.dat", "helix/dtl_section.dat", "flame/ALL_lattice.lat"]
ALL = os.environ.get("LATTIX_VIEW_E2E_ALL") == "1"
SMOKE_DECKS = [rel for rel, _, _ in DECKS] if ALL else FAST_DECKS


def pytest_collection_modifyitems(items):
    for item in items:
        if Path(str(item.fspath)).parent == Path(__file__).parent:
            item.add_marker(pytest.mark.browser)


@pytest.fixture(scope="session")
def chromium():
    pw = pytest.importorskip("playwright.sync_api", reason="the browser extra is not installed")
    if not (PUBLIC / "helix" / "csr_chicane.dat").is_file():
        pytest.skip("lattix public decks not available")
    ARTIFACTS.mkdir(exist_ok=True)
    with pw.sync_playwright() as p:
        try:
            browser = p.chromium.launch(args=CHROMIUM_ARGS)
        except Exception as exc:  # noqa: BLE001
            pytest.skip(f"chromium not available: {str(exc).splitlines()[0]}")
        yield browser
        browser.close()


class Workbench:
    """The in-process workbench with the plugin: one session per deck, reused across tests."""

    def __init__(self):
        from lattix.ui.plugins import compile_plugin
        from lattix.ui.server import App, Settings, start_in_thread

        from lattix_view.plugin import register

        self.settings = Settings(root=PUBLIC, open_browser=False, quiet=True)
        self.app = App(self.settings, oracle_probe=lambda: {}, plugins=[compile_plugin(register())])
        self.srv, self.thread, self.port = start_in_thread(self.app, "127.0.0.1", 0)
        self.sessions: dict[str, str] = {}

    def session_for(self, deck: str) -> str:
        from lattix.errors import MissingDependencyError
        from lattix.ui.server import ApiError, load_source

        if deck not in self.sessions:
            s = self.app.sessions.create()
            try:
                s.source = load_source(self.app, s, {"source": {"sample": deck}})
            except MissingDependencyError as exc:
                pytest.skip(str(exc))
            except ApiError as exc:
                if "MissingDependency" in str(exc) or "cpymad" in str(exc):
                    pytest.skip(str(exc))
                raise
            self.sessions[deck] = s.id
        return self.sessions[deck]

    def url(self, deck: str, query: str = "") -> str:
        sid = self.session_for(deck)
        return f"http://127.0.0.1:{self.port}/plugins/lattix_view/?token={self.settings.token}&session={sid}{query}"

    def close(self):
        self.srv.shutdown()
        self.srv.server_close()
        self.app.close()


@pytest.fixture(scope="session")
def workbench(chromium):
    wb = Workbench()
    yield wb
    wb.close()


class Opened:
    """A page on the 3D view of one deck, with its console errors and a few helpers."""

    def __init__(self, context, page, url):
        self.context, self.page, self.url = context, page, url
        self.errors: list[str] = []
        page.on("console", lambda m: self.errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: self.errors.append(f"pageerror: {e}"))

    def wait_ready(self, timeout=180_000):
        self.page.wait_for_function(READY, timeout=timeout)
        return self

    def settle(self, frames: int = 3):
        """Let the page render `frames` animation frames."""
        for _ in range(frames):
            self.page.evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")

    def evaluate(self, js: str):
        return self.page.evaluate(js)

    def stats(self) -> dict:
        return self.page.evaluate("window.lattix3d.stats()")

    def payload(self) -> dict:
        return self.page.evaluate("window.lattix3d.state.payload")

    def screenshot(self, name: str, **kw) -> Path:
        path = ARTIFACTS / name
        self.page.screenshot(path=str(path), **kw)
        return path

    def download(self, click_js_selector: str, timeout=180_000) -> Path:
        with self.page.expect_download(timeout=timeout) as dl:
            self.page.click(click_js_selector)
        d = dl.value
        path = ARTIFACTS / d.suggested_filename
        d.save_as(str(path))
        return path


@pytest.fixture
def open_view(chromium, workbench):
    opened: list[Opened] = []

    def _open(deck: str, query: str = "&static=1", viewport=(1280, 800), downloads=False, init_script=None, ready=True):
        context = chromium.new_context(viewport={"width": viewport[0], "height": viewport[1]}, bypass_csp=True,
                                       accept_downloads=downloads)
        if init_script:
            context.add_init_script(init_script)
        page = context.new_page()
        url = workbench.url(deck, query)
        o = Opened(context, page, url)
        page.goto(url, wait_until="load")
        if ready:
            o.wait_ready()
        opened.append(o)
        return o

    yield _open
    for o in opened:
        o.context.close()


def thick_element(payload: dict, kinds=("Quadrupole", "Bend", "Solenoid", "RFCavity")) -> int:
    """An element with hardware to hover: the first of the given kinds that is at least 5 cm long."""
    el, kinds_tbl = payload["el"], payload["kinds"]
    for i in range(payload["lattice"]["n"]):
        if kinds_tbl[el["kind"][i]] in kinds and el["L"][i] >= 0.05 and not (el["flags"][i] & 64):
            return i
    return -1
