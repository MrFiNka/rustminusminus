import { useState } from "react";

/** Shared "create by name" flow: POST {name} to `postUrl`, then call `onCreated`. */
export function useCreateEntity(postUrl: string, defaultError: string, onCreated: () => void) {
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        if (!name.trim()) return;
        setSubmitting(true);
        setError(null);
        const res = await fetch(postUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
        });
        const json = await res.json();
        setSubmitting(false);
        if (!res.ok) {
            setError(json.error ?? defaultError);
            return;
        }
        setCreating(false);
        setName("");
        onCreated();
    };

    const cancel = () => {
        setCreating(false);
        setName("");
        setError(null);
    };

    return { creating, setCreating, name, setName, submitting, error, submit, cancel };
}
