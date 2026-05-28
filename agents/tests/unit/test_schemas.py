from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.schemas import (
    AutomationFile as SchemaAutomationFile,
    TestScenario as SchemaTestScenario,
    TestStep as SchemaTestStep,
)


def test_test_scenario_requires_expected_result_in_each_step():
    with pytest.raises(ValidationError):
        SchemaTestScenario(
            id="TC_001",
            name="Invalid scenario",
            steps=[{"id": "1", "action": "Do something"}],
        )


def test_automation_file_requires_filename_and_content():
    automation = SchemaAutomationFile(filename="login.yaml", content="name: login")

    assert automation.filename == "login.yaml"
    assert automation.content == "name: login"


def test_test_step_keeps_string_ids():
    step = SchemaTestStep(id="1", action="Tap save", expected_result="Form is submitted")

    assert step.id == "1"
