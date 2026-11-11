"""Fixed offline pytest entrypoint suitable for a narrow Codex execution rule."""
import argparse
import os
from pathlib import Path
import sys


def main(argv=None) -> int:
    """Run the fixed local test directory after rejecting argument expansion.

    Inherited pytest options and plugin discovery are disabled so a command-prefix
    permission cannot load additional test paths or environment-selected plugins.
    """
    parser = argparse.ArgumentParser(description="Run only the reviewed collector tests; no extra arguments.", allow_abbrev=False)
    arguments = list(sys.argv[1:] if argv is None else argv)
    parser.parse_args([] if arguments == ["--"] else arguments)
    os.environ.pop("PYTEST_ADDOPTS", None)
    os.environ.pop("PYTEST_PLUGINS", None)
    os.environ["PYTEST_DISABLE_PLUGIN_AUTOLOAD"] = "1"
    import pytest
    return int(pytest.main([str(Path(__file__).resolve().parents[1] / "tests")]))


if __name__ == "__main__":
    sys.exit(main())
