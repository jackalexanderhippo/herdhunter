"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { canAccessAdminArea, canManageTemplates } from "@/lib/access";
import { Plus, Trash2, Pencil, ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { TemplateContent } from "@/components/templates/TemplateContent";
import { parseTemplateQuestions } from "@/lib/interview-templates";

interface Template {
    id: string;
    name: string;
    description?: string | null;
    questions: string; // JSON
    createdBy: { id: string; name: string | null };
    createdAt: string;
}

export default function TemplatesPage() {
    const { data: session } = useSession();
    const [templates, setTemplates] = useState<Template[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState({ name: "", description: "", questions: [""] });
    const [bulkImport, setBulkImport] = useState("");
    const [saving, setSaving] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const canEdit = canManageTemplates(session?.user.role);
    const canDelete = canAccessAdminArea(session?.user.role);

    useEffect(() => {
        fetch("/api/interview-templates").then((r) => r.json()).then(setTemplates).finally(() => setLoading(false));
    }, [session, canEdit]);

    const resetForm = () => {
        setForm({ name: "", description: "", questions: [""] });
        setBulkImport("");
        setEditingId(null);
        setShowForm(false);
    };

    const startEdit = (t: Template) => {
        setForm({ name: t.name, description: t.description ?? "", questions: parseTemplateQuestions(t.questions) });
        setEditingId(t.id);
        setShowForm(true);
    };

    const addQuestion = () => setForm((f) => ({ ...f, questions: [...f.questions, ""] }));
    const removeQuestion = (i: number) => setForm((f) => ({ ...f, questions: f.questions.filter((_, idx) => idx !== i) }));
    const setQuestion = (i: number, val: string) => setForm((f) => {
        const qs = [...f.questions]; qs[i] = val; return { ...f, questions: qs };
    });
    const appendQuestionSnippet = (i: number, snippet: string) => setForm((f) => {
        const qs = [...f.questions];
        const current = qs[i] ?? "";
        qs[i] = `${current.trimEnd()}${current.trim() ? "\n\n" : ""}${snippet}`;
        return { ...f, questions: qs };
    });
    const importBulkQuestions = () => {
        const parsed = bulkImport
            .split(/\n\s*\n+/)
            .map((block) => block.trim())
            .filter(Boolean);
        if (parsed.length === 0) return;
        setForm((f) => ({ ...f, questions: parsed }));
    };

    const save = useCallback(async () => {
        if (!form.name.trim()) return;
        setSaving(true);
        const body = { name: form.name, description: form.description || null, questions: form.questions.filter(Boolean) };
        const url = editingId ? `/api/interview-templates/${editingId}` : "/api/interview-templates";
        const method = editingId ? "PATCH" : "POST";
        const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (res.ok) {
            const data = await res.json();
            if (editingId) {
                setTemplates((ts) => ts.map((t) => t.id === editingId ? data : t));
            } else {
                setTemplates((ts) => [data, ...ts]);
            }
            resetForm();
        }
        setSaving(false);
    }, [form, editingId]);

    const deleteTemplate = async (id: string) => {
        if (!confirm("Delete this template?")) return;
        await fetch(`/api/interview-templates/${id}`, { method: "DELETE" });
        setTemplates((ts) => ts.filter((t) => t.id !== id));
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1>Interview Templates</h1>
                    <p>Reusable question sets for structured interviews</p>
                </div>
                {canEdit && !showForm && (
                    <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                        <Plus size={14} /> New Template
                    </button>
                )}
            </div>

            {showForm && (
                <div className="card" style={{ marginBottom: "1.5rem" }}>
                    <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1.25rem" }}>
                        {editingId ? "Edit Template" : "New Template"}
                    </h2>
                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                        <div className="grid-2">
                            <div className="form-group">
                                <label>Template Name *</label>
                                <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Technical Screen" />
                            </div>
                            <div className="form-group">
                                <label>Description</label>
                                <input className="input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Prompts / sections</label>
                            <div className="surface-2" style={{ padding: "0.85rem", marginBottom: "0.85rem" }}>
                                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
                                    Paste content from Google Docs or Word and split it into sections on blank lines.
                                </div>
                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                                    You can also include images with <code>![Alt text](https://...)</code> and code blocks with fenced backticks.
                                </div>
                                <textarea
                                    className="input"
                                    rows={6}
                                    value={bulkImport}
                                    onChange={(e) => setBulkImport(e.target.value)}
                                    placeholder="Paste template draft here…"
                                    style={{ resize: "vertical", marginBottom: "0.5rem" }}
                                />
                                <button className="btn btn-secondary btn-sm" onClick={importBulkQuestions} disabled={!bulkImport.trim()}>
                                    <Plus size={12} /> Replace Sections From Pasted Text
                                </button>
                            </div>
                            {form.questions.map((q, i) => (
                                <div key={i} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                                    <GripVertical size={14} style={{ color: "var(--text-muted)", flexShrink: 0, marginTop: "0.7rem" }} />
                                    <div style={{ flex: 1 }}>
                                        <textarea
                                            className="input"
                                            style={{ width: "100%", resize: "vertical" }}
                                            value={q}
                                            onChange={(e) => setQuestion(i, e.target.value)}
                                            placeholder={`Section ${i + 1}`}
                                            rows={5}
                                        />
                                        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.5rem", marginBottom: "0.5rem" }}>
                                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => appendQuestionSnippet(i, "![Describe image](https://example.com/image.png)")}>
                                                <Plus size={12} /> Insert Image
                                            </button>
                                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => appendQuestionSnippet(i, "```ts\n// Add example code here\n```")}>
                                                <Plus size={12} /> Insert Code Block
                                            </button>
                                        </div>
                                        {q.trim() && (
                                            <div className="surface-2" style={{ padding: "0.75rem" }}>
                                                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.4rem" }}>
                                                    Preview
                                                </div>
                                                <TemplateContent content={q} compact />
                                            </div>
                                        )}
                                    </div>
                                    <button className="btn btn-ghost btn-sm" onClick={() => removeQuestion(i)} disabled={form.questions.length === 1} style={{ marginTop: "0.35rem" }}>
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ))}
                            <button className="btn btn-ghost btn-sm" onClick={addQuestion} style={{ marginTop: "0.25rem" }}>
                                <Plus size={12} /> Add Section
                            </button>
                        </div>

                        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                            <button className="btn btn-ghost" onClick={resetForm}>Cancel</button>
                            <button className="btn btn-primary" onClick={save} disabled={saving || !form.name.trim()}>
                                {saving ? "Saving…" : editingId ? "Update" : "Create Template"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="empty-state">Loading…</div>
            ) : templates.length === 0 ? (
                <div className="empty-state">
                    <p>No templates yet. Create one to get started.</p>
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {templates.map((t) => {
                        const questions = parseTemplateQuestions(t.questions);
                        const expanded = expandedId === t.id;
                        return (
                            <div key={t.id} className="card">
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                                    <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setExpandedId(expanded ? null : t.id)}>
                                        <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{t.name}</div>
                                        {t.description && <div style={{ color: "var(--text-secondary)", fontSize: "0.8rem", marginTop: "0.15rem" }}>{t.description}</div>}
                                        <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.25rem" }}>
                                            {questions.length} section{questions.length !== 1 ? "s" : ""} · by {t.createdBy.name ?? "Unknown"}
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
                                        {canEdit && <button className="btn btn-ghost btn-sm" onClick={() => startEdit(t)}><Pencil size={13} /></button>}
                                        {canDelete && <button className="btn btn-ghost btn-sm" onClick={() => deleteTemplate(t.id)} style={{ color: "#f87171" }}><Trash2 size={13} /></button>}
                                        <button className="btn btn-ghost btn-sm" onClick={() => setExpandedId(expanded ? null : t.id)}>
                                            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                        </button>
                                    </div>
                                </div>
                                {expanded && questions.length > 0 && (
                                    <ol style={{ margin: "0.75rem 0 0 1.5rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                                        {questions.map((q, i) => (
                                            <li key={i} style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                                                <TemplateContent content={q} compact />
                                            </li>
                                        ))}
                                    </ol>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
