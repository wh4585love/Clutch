"""Workflow must stop when an agent_task step fails."""

from __future__ import annotations

import pytest

from src.compiler import compile_workflow, initial_compiler_state, workflow_run_config
from src.workflow_cancel import WorkflowStepFailed


WORKFLOW = {
    "id": "fail-stop-test",
    "name": "Fail Stop Test",
    "version": 1,
    "nodes": [
        {
            "id": "step1",
            "type": "agent_task",
            "data": {"label": "Architect", "agent": "agent-1", "tool": "agy-cli"},
        },
        {
            "id": "step2",
            "type": "agent_task",
            "data": {"label": "Writer", "agent": "agent-2", "tool": "claude-cli"},
        },
        {"id": "end", "type": "end", "data": {"label": "Done"}},
    ],
    "edges": [
        {"id": "e1", "source": "start", "target": "step1"},
        {"id": "e2", "source": "step1", "target": "step2"},
        {"id": "e3", "source": "step2", "target": "end"},
    ],
}


def test_workflow_stops_after_failed_agent_step(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    def fake_execute(node_data, *, instruction="", run_id="", node_id=""):
        from src.agent_executor import AgentTaskResult
        from src.chat_events import chat_message

        agent = str(node_data.get("agent", ""))
        calls.append(agent)
        if agent == "agent-1":
            return AgentTaskResult(
                agent="Architect",
                output="Antigravity CLI finished but returned no text.",
                logs=[],
                message=chat_message("Architect", "Antigravity CLI finished but returned no text.", status="FAILED"),
                failed=True,
            )
        return AgentTaskResult(
            agent="Writer",
            output="should not run",
            logs=[],
            message=chat_message("Writer", "should not run"),
        )

    monkeypatch.setattr("src.compiler.compiler.execute_agent_task", fake_execute)
    monkeypatch.setattr("src.compiler.compiler.emit_workflow_agent_step", lambda *_args, **_kwargs: None)

    compiled = compile_workflow(WORKFLOW)
    with pytest.raises(WorkflowStepFailed):
        compiled.invoke(
            initial_compiler_state("run_fail_stop", instruction="test"),
            workflow_run_config("run_fail_stop"),
        )

    assert calls == ["agent-1"]


def _ok_execute(node_data, *, instruction="", run_id="", node_id=""):
    from src.agent_executor import AgentTaskResult
    from src.chat_events import chat_message

    agent = str(node_data.get("agent", ""))
    return AgentTaskResult(agent=agent, output="done", logs=[], message=chat_message(agent, "done"))


def _run_with_deliverables(monkeypatch, tmp_path, deliverables):
    from src import workspace

    workspace.clear_workspace_for_tests()
    workspace.set_workspace(str(tmp_path))
    monkeypatch.setattr("src.compiler.compiler.execute_agent_task", _ok_execute)
    monkeypatch.setattr("src.compiler.compiler.emit_workflow_agent_step", lambda *_a, **_k: None)
    monkeypatch.setattr(
        "src.engine_router.find_agent",
        lambda ref: {"id": ref, "name": "BA", "deliverables": deliverables},
    )
    compiled = compile_workflow(WORKFLOW)
    try:
        return compiled.invoke(
            initial_compiler_state("run_deliv", instruction="test"),
            workflow_run_config("run_deliv"),
        )
    finally:
        workspace.clear_workspace_for_tests()


def test_missing_deliverable_fails_step(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    with pytest.raises(WorkflowStepFailed) as exc_info:
        _run_with_deliverables(monkeypatch, tmp_path, [{"name": "docs/prd.md", "content": ""}])
    assert "prd.md" in str(exc_info.value.message) or "交付物" in str(exc_info.value.message)


def test_present_deliverable_passes(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs" / "prd.md").write_text("# PRD", encoding="utf-8")
    result = _run_with_deliverables(monkeypatch, tmp_path, [{"name": "docs/prd.md", "content": ""}])
    assert result["status"] == "passed"


def test_empty_deliverables_skips_check(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    result = _run_with_deliverables(monkeypatch, tmp_path, [])
    assert result["status"] == "passed"
