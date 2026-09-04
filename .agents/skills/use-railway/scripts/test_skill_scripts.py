import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock


SCRIPTS = Path(__file__).parent


def load_script(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class RailwaySkillScriptTests(unittest.TestCase):
    def setUp(self):
        self.run_psql_query = Mock(return_value=(0, ""))
        dal = types.ModuleType("dal")
        dal.run_psql_query = self.run_psql_query
        dal.run_railway_command = Mock(return_value=(0, "", ""))
        dal.info = Mock()
        dal.error = Mock(side_effect=RuntimeError)
        dal.confirm_with_user = Mock(return_value=False)
        sys.modules["dal"] = dal

    def tearDown(self):
        sys.modules.pop("dal", None)

    def test_extension_name_rejects_sql_before_query(self):
        module = load_script("pg_extensions", "pg-extensions.py")

        with self.assertRaises(ValueError):
            module.get_extension_dependencies("postgres", "x'; DROP DATABASE app; --")

        self.run_psql_query.assert_not_called()

    def test_enable_pg_stats_imports_restart_helper(self):
        module = load_script("enable_pg_stats", "enable-pg-stats.py")

        self.assertTrue(callable(module.run_railway_command))


if __name__ == "__main__":
    unittest.main()
