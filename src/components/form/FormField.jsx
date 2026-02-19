function FormField({ label, required = false, error = false, className = "", children }) {
  return (
    <label className={`field-block ${required ? "required" : ""} ${error ? "field-error" : ""} ${className}`.trim()}>
      {label ? <span>{label}</span> : null}
      {children}
    </label>
  );
}

export default FormField;

