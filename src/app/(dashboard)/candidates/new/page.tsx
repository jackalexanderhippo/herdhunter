"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

interface Profession { id: string; name: string; }
interface OpenPosition { id: string; title: string; level?: string | null; team?: string | null; }
interface ProviderStatus {
    providerId: string;
    providerLabel: string;
    configured: boolean;
    missingConfig: string[];
    capabilities: {
        candidateLookup: boolean;
        candidateSync: boolean;
        candidateCvAccess: boolean;
        positionSync: boolean;
        feedbackPush: boolean;
    };
}

export default function NewCandidatePage() {
    const router = useRouter();
    const [professions, setProfessions] = useState<Profession[]>([]);
    const [positions, setPositions] = useState<OpenPosition[]>([]);
    const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
    const [form, setForm] = useState({
        name: "",
        email: "",
        phone: "",
        professionId: "",
        openPositionId: "",
        status: "NEW",
        noticePeriodDays: "",
        salaryExpectation: "",
        recommendedSalary: "",
        eployCandidateId: "",
        eployMetadata: "",
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [lookupCandidateId, setLookupCandidateId] = useState("");
    const [lookupEmail, setLookupEmail] = useState("");
    const [importing, setImporting] = useState(false);
    const [importMessage, setImportMessage] = useState("");

    useEffect(() => {
        fetch("/api/professions").then((r) => r.json()).then(setProfessions).catch(() => { });
        fetch("/api/open-positions").then((r) => r.json()).then((data) => setPositions(Array.isArray(data) ? data : [])).catch(() => { });
        fetch("/api/provider").then((r) => r.json()).then(setProviderStatus).catch(() => { });
    }, []);

    const set = (field: string, value: string) => {
        setForm((f) => ({ ...f, [field]: value }));
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim() || !form.openPositionId) { setError("Name and open position are required"); return; }
        setSubmitting(true);
        setError("");
        const payload = {
            ...form,
            noticePeriodDays: form.noticePeriodDays ? Number(form.noticePeriodDays) : null,
            salaryExpectation: form.salaryExpectation ? Number(form.salaryExpectation) : null,
            recommendedSalary: form.recommendedSalary ? Number(form.recommendedSalary) : null,
        };
        const res = await fetch("/api/candidates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (res.ok) {
            const data = await res.json();
            router.push(`/candidates/${data.id}`);
        } else {
            const err = await res.json();
            setError(err.error ?? "Failed to create candidate");
        }
        setSubmitting(false);
    };

    const importFromSource = async () => {
        if (!lookupCandidateId.trim() && !lookupEmail.trim()) {
            setImportMessage("Enter a source candidate ID or email address");
            return;
        }

        setImporting(true);
        setImportMessage("");
        const res = await fetch("/api/provider/candidates/lookup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                externalCandidateId: lookupCandidateId.trim() || undefined,
                email: lookupEmail.trim() || undefined,
            }),
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) {
            setImportMessage(data?.error ?? "Failed to import from source");
            setImporting(false);
            return;
        }

        setForm((current) => ({
            ...current,
            name: data.name ?? current.name,
            email: data.email ?? current.email,
            phone: data.phone ?? current.phone,
            noticePeriodDays: data.mappedFields?.noticePeriodDays != null ? String(data.mappedFields.noticePeriodDays) : current.noticePeriodDays,
            salaryExpectation: data.mappedFields?.salaryExpectation != null ? String(data.mappedFields.salaryExpectation) : current.salaryExpectation,
            eployCandidateId: data.externalCandidateId ?? current.eployCandidateId,
            eployMetadata: JSON.stringify({
                provider: providerStatus?.providerId ?? "eploy",
                importedAt: new Date().toISOString(),
                candidate: data.rawCandidate ?? null,
                candidateQuestions: data.rawQuestions ?? null,
                candidateCv: data.cv?.metadata ?? null,
            }, null, 2),
        }));
        setImportMessage(`Imported candidate details from ${providerStatus?.providerLabel ?? "source"}`);
        setImporting(false);
    };

    return (
        <div style={{ maxWidth: "640px" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => router.back()} style={{ marginBottom: "1.5rem" }}>
                <ArrowLeft size={14} /> Back
            </button>
            <div className="page-header">
                <div>
                    <h1>Add Candidate</h1>
                    <p>Fill in the candidate&apos;s details</p>
                </div>
            </div>

            {error && <div className="alert alert-error" style={{ marginBottom: "1rem" }}>{error}</div>}

            {providerStatus && (
                <div className="card" style={{ marginBottom: "1rem" }}>
                    <h2 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.35rem" }}>Import From {providerStatus.providerLabel}</h2>
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "1rem" }}>
                        Pull candidate details from the configured source system before creating the local record.
                    </p>
                    {providerStatus.configured && providerStatus.capabilities.candidateLookup ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                            <div className="grid-2">
                                <div className="form-group">
                                    <label htmlFor="lookup-candidate-id">Source Candidate ID</label>
                                    <input id="lookup-candidate-id" className="input" value={lookupCandidateId} onChange={(e) => setLookupCandidateId(e.target.value)} placeholder="e.g. 12345" />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="lookup-email">Candidate Email</label>
                                    <input id="lookup-email" className="input" type="email" value={lookupEmail} onChange={(e) => setLookupEmail(e.target.value)} placeholder="jane@example.com" />
                                </div>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
                                <div style={{ fontSize: "0.8rem", color: importMessage ? "var(--text-secondary)" : "var(--text-muted)" }}>
                                    {importMessage || "This will prefill the form with source data and metadata."}
                                </div>
                                <button type="button" className="btn btn-secondary" onClick={importFromSource} disabled={importing}>
                                    {importing ? "Importing…" : `Import From ${providerStatus.providerLabel}`}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div style={{ fontSize: "0.84rem", color: "var(--text-secondary)" }}>
                            Source import is not configured yet{providerStatus.missingConfig.length > 0 ? `: ${providerStatus.missingConfig.join(", ")}` : "."}
                        </div>
                    )}
                </div>
            )}

            <form onSubmit={submit} className="card">
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                    <div className="grid-2">
                        <div className="form-group">
                            <label htmlFor="name">Full Name *</label>
                            <input id="name" className="input" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Jane Smith" required />
                        </div>
                        <div className="form-group">
                            <label htmlFor="email">Email</label>
                            <input id="email" className="input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="jane@example.com" />
                        </div>
                    </div>

                    <div className="grid-2">
                        <div className="form-group">
                            <label htmlFor="phone">Phone</label>
                            <input id="phone" className="input" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+44 7700 000000" />
                        </div>
                        <div className="form-group">
                            <label htmlFor="status">Initial Status</label>
                            <select id="status" className="input" value={form.status} onChange={(e) => set("status", e.target.value)}>
                                <option value="NEW">New</option>
                                <option value="SCREENING">Screening</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid-2">
                        <div className="form-group">
                            <label htmlFor="profession">Profession</label>
                            <select id="profession" className="input" value={form.professionId} onChange={(e) => set("professionId", e.target.value)}>
                                <option value="">Select profession…</option>
                                {professions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label htmlFor="open-position">Open Position</label>
                            <select id="open-position" className="input" value={form.openPositionId} onChange={(e) => set("openPositionId", e.target.value)} required>
                                <option value="">Select position…</option>
                                {positions.map((position) => (
                                    <option key={position.id} value={position.id}>
                                        {position.title}{position.team ? ` · ${position.team}` : ""}{position.level ? ` · ${position.level}` : ""}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid-2">
                        <div className="form-group">
                            <label htmlFor="notice">Notice Period (days)</label>
                            <input id="notice" className="input" type="number" min={0} value={form.noticePeriodDays} onChange={(e) => set("noticePeriodDays", e.target.value)} placeholder="e.g. 30" />
                        </div>
                        <div className="form-group">
                            <label htmlFor="salary-exp">Salary Expectation</label>
                            <input id="salary-exp" className="input" type="number" min={0} value={form.salaryExpectation} onChange={(e) => set("salaryExpectation", e.target.value)} placeholder="e.g. 120000" />
                        </div>
                    </div>

                    <div className="form-group">
                        <label htmlFor="salary-rec">Recommended Offer Salary</label>
                        <input id="salary-rec" className="input" type="number" min={0} value={form.recommendedSalary} onChange={(e) => set("recommendedSalary", e.target.value)} placeholder="Optional for later stages" />
                    </div>

                    <div className="card-sm" style={{ padding: "1rem" }}>
                        <h2 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.85rem" }}>Source metadata</h2>
                        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                            <div className="form-group">
                                <label htmlFor="eploy-candidate-id">Source Candidate ID</label>
                                    <input id="eploy-candidate-id" className="input" value={form.eployCandidateId} onChange={(e) => set("eployCandidateId", e.target.value)} placeholder="External candidate reference" />
                            </div>
                            <div className="form-group">
                                <label htmlFor="eploy-metadata">Source metadata / raw payload</label>
                                <textarea id="eploy-metadata" className="input" rows={4} value={form.eployMetadata} onChange={(e) => set("eployMetadata", e.target.value)} placeholder="Optional JSON or copied metadata from ePloy." />
                            </div>
                        </div>
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", paddingTop: "0.5rem" }}>
                        <button type="button" className="btn btn-ghost" onClick={() => router.back()}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? "Creating…" : "Create Candidate"}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}
