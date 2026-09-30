///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, useEffect, useState } from "react";
import Alert from "@rapidmx/web-client/lib/components/feedback/Alert.js";
import Button from "@rapidmx/web-client/lib/components/buttons/Button.js";
import { Task, TaskPriority, TaskStatus, WorkspaceMember, createTask, deleteTask, errorMessage, listMembers, listTasks, updateTask } from "../crmApi.js";
import { INPUT_CLASS, useCrm } from "./CrmShell.js";

/** The workspace's tasks: open or done, anyone's or one member's, with a form for a new one. A task about a record links to it. */
export default function TaskList() {
    const { workspace, canWrite, href } = useCrm();
    const [status, setStatus] = useState<TaskStatus>("open");
    const [assignee, setAssignee] = useState("");
    const [tasks, setTasks] = useState<Task[]>([]);
    const [members, setMembers] = useState<WorkspaceMember[]>([]);
    const [title, setTitle] = useState("");
    const [priority, setPriority] = useState<TaskPriority>("normal");
    const [dueAt, setDueAt] = useState("");
    const [error, setError] = useState<string | null>(null);

    async function load(): Promise<void> {
        try {
            setTasks(await listTasks(workspace.uid, { status, assigneeUserUid: assignee || undefined }));
            setError(null);
        } catch (err) {
            setError(errorMessage(err, "Could not load the tasks."));
        }
    }

    useEffect(() => {
        listMembers(workspace.uid)
            .then(setMembers)
            .catch(() => setMembers([]));
    }, [workspace.uid]);

    useEffect(() => {
        void load();
    }, [workspace.uid, status, assignee]);

    async function add(event: FormEvent): Promise<void> {
        event.preventDefault();
        try {
            await createTask(workspace.uid, { title, priority, ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}), ...(assignee ? { assigneeUserUid: assignee } : {}) });
            setTitle("");
            setDueAt("");
            await load();
        } catch (err) {
            setError(errorMessage(err, "Could not add the task."));
        }
    }

    const memberName = (userUid?: string): string => {
        const member: WorkspaceMember | undefined = members.find((entry) => entry.userUid === userUid);
        return member?.displayName || member?.address || userUid || "";
    };

    return (
        <div className="max-w-4xl">
            <h1 className="text-lg font-bold tracking-tight mb-4">Tasks</h1>
            <div className="flex flex-wrap gap-2 mb-4">
                <select aria-label="Status" className={`${INPUT_CLASS} !w-36`} value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)}>
                    <option value="open">Open</option>
                    <option value="done">Done</option>
                </select>
                <select aria-label="Assignee" className={`${INPUT_CLASS} !w-56`} value={assignee} onChange={(event) => setAssignee(event.target.value)}>
                    <option value="">Everyone</option>
                    {members.map((member) => (
                        <option key={member.userUid} value={member.userUid}>
                            {memberName(member.userUid)}
                        </option>
                    ))}
                </select>
            </div>
            {error && <Alert>{error}</Alert>}
            {canWrite && (
                <form onSubmit={add} className="flex flex-wrap gap-2 mb-4" aria-label="New task">
                    <input aria-label="Title" placeholder="New task" className={`${INPUT_CLASS} !w-72`} value={title} onChange={(event) => setTitle(event.target.value)} />
                    <select aria-label="Priority" className={`${INPUT_CLASS} !w-32`} value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                    </select>
                    <input aria-label="Due" type="date" className={`${INPUT_CLASS} !w-40`} value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
                    <Button type="submit" disabled={title.trim() === ""} className="!w-auto">
                        Add task
                    </Button>
                </form>
            )}
            {tasks.length === 0 ? (
                <p className="text-sm text-text-muted">No {status} tasks.</p>
            ) : (
                <ul className="flex flex-col divide-y divide-border border-y border-border">
                    {tasks.map((task) => (
                        <li key={task.uid} className="flex items-center gap-3 py-2 text-sm">
                            <input
                                type="checkbox"
                                aria-label={`Done: ${task.title}`}
                                checked={task.status === "done"}
                                disabled={!canWrite}
                                onChange={async () => {
                                    await updateTask(workspace.uid, task.uid, { status: task.status === "done" ? "open" : "done" });
                                    await load();
                                }}
                            />
                            <span className="flex-1">
                                {task.title}
                                {task.priority === "high" && <span className="ml-2 text-xs text-danger font-semibold">High</span>}
                                {task.subjectUid && (
                                    <a
                                        className="ml-2 text-xs text-primary-dark hover:underline"
                                        href={href(`/crm/${task.subjectType === "company" ? "companies" : "contacts"}/${encodeURIComponent(task.subjectUid)}`)}
                                    >
                                        Open {task.subjectType}
                                    </a>
                                )}
                            </span>
                            <span className="text-xs text-text-muted">{memberName(task.assigneeUserUid)}</span>
                            <span className="text-xs text-text-muted w-24 text-right">{task.dueAt ? new Date(task.dueAt).toLocaleDateString() : ""}</span>
                            {canWrite && (
                                <button
                                    type="button"
                                    aria-label={`Delete ${task.title}`}
                                    className="text-xs text-text-muted hover:text-danger"
                                    onClick={async () => {
                                        await deleteTask(workspace.uid, task.uid);
                                        await load();
                                    }}
                                >
                                    Delete
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
