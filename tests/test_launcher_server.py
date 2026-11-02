"""Startup regression checks; Windows batch execution still needs a Windows PC."""
import contextlib
import importlib.util
import io
from pathlib import Path
import unittest
from unittest.mock import Mock, patch


SERVER_PATH = (
    Path(__file__).resolve().parents[1]
    / "social_effects_in_label_coining-main 2"
    / "01_jspsych_main_social"
    / "local_server.py"
)
SPEC = importlib.util.spec_from_file_location("experiment_local_server", SERVER_PATH)
server_module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(server_module)


class ServerStartupTests(unittest.TestCase):
    def fake_server(self, port=8000):
        server = Mock(server_port=port)
        manager = Mock()
        manager.__enter__ = Mock(return_value=server)
        manager.__exit__ = Mock(return_value=False)
        return manager, server

    def test_default_port_keeps_manual_start_browser_free(self):
        manager, server = self.fake_server()
        with (
            patch.object(server_module, "ThreadingHTTPServer", return_value=manager) as create,
            patch.object(server_module, "lan_ip", return_value="192.168.1.2"),
            patch.object(server_module.threading, "Timer") as timer,
            contextlib.redirect_stdout(io.StringIO()),
        ):
            self.assertEqual(server_module.main([]), 0)
        create.assert_called_once_with(("0.0.0.0", 8000), server_module.Handler)
        server.serve_forever.assert_called_once_with()
        timer.assert_not_called()
        manager.__exit__.assert_called_once()

    def test_open_requests_browser_only_after_successful_binding(self):
        manager, server = self.fake_server(port=8080)
        events = []
        server.serve_forever.side_effect = lambda: events.append("serving")

        class ImmediateTimer:
            def __init__(self, delay, callback, args):
                self.callback, self.args = callback, args

            def start(self):
                # The browser request is made after constructing/binding the server.
                self.callback(*self.args)

            def cancel(self):
                events.append("cancelled")

        def bound_server(address, handler):
            events.append("bound")
            return manager

        with (
            patch.object(server_module, "ThreadingHTTPServer", side_effect=bound_server) as create,
            patch.object(server_module, "lan_ip", return_value="192.168.1.2"),
            patch.object(server_module.threading, "Timer", ImmediateTimer),
            patch.object(server_module.webbrowser, "open", side_effect=lambda url: events.append(url)),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            self.assertEqual(server_module.main(["8080", "--open"]), 0)
        create.assert_called_once_with(("0.0.0.0", 8080), server_module.Handler)
        self.assertEqual(events, [
            "bound", "http://localhost:8080/main_social_basic.html", "serving", "cancelled"
        ])

    def test_bind_failure_does_not_open_browser(self):
        with (
            patch.object(server_module, "ThreadingHTTPServer", side_effect=OSError("port in use")),
            patch.object(server_module.threading, "Timer") as timer,
            patch.object(server_module.webbrowser, "open") as browser,
        ):
            with self.assertRaisesRegex(OSError, "port in use"):
                server_module.main(["8000", "--open"])
        timer.assert_not_called()
        browser.assert_not_called()

    def test_interrupt_cancels_pending_browser_and_closes_socket(self):
        manager, server = self.fake_server()
        server.serve_forever.side_effect = KeyboardInterrupt
        with (
            patch.object(server_module, "ThreadingHTTPServer", return_value=manager),
            patch.object(server_module, "lan_ip", return_value="192.168.1.2"),
            patch.object(server_module.threading, "Timer") as timer,
            contextlib.redirect_stdout(io.StringIO()),
        ):
            self.assertEqual(server_module.main(["--open"]), 0)
        timer.return_value.start.assert_called_once_with()
        timer.return_value.cancel.assert_called_once_with()
        manager.__exit__.assert_called_once()


if __name__ == "__main__":
    unittest.main()
