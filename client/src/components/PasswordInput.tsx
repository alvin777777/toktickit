import { useState } from "react";

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
}

// ui-spec.md §11 — password field with an accessible show/hide toggle.
export default function PasswordInput({ id, label, value, onChange, autoComplete, error, disabled, required = true }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <label htmlFor={id} className="form-label fw-semibold">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      <div className="input-group has-validation">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          className={"form-control" + (error ? " is-invalid" : "")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          disabled={disabled}
        >
          {visible ? "Hide" : "Show"}
        </button>
        {error && <div className="invalid-feedback">{error}</div>}
      </div>
    </>
  );
}
