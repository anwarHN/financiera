function ToggleSwitch({
  label,
  checked,
  onChange,
  name = "",
  disabled = false,
  className = "",
  helpText = "",
  align = "left"
}) {
  const wrapperClassName = [
    "toggle-switch-wrap",
    align === "right" ? "toggle-switch-wrap-right" : "",
    className
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapperClassName}>
      <label className="toggle-switch">
        <input type="checkbox" name={name} checked={Boolean(checked)} onChange={onChange} disabled={disabled} />
        <span className="toggle-switch-ui" aria-hidden="true" />
        <span className="toggle-switch-label">{label}</span>
      </label>
      {helpText ? <p className="toggle-switch-help">{helpText}</p> : null}
    </div>
  );
}

export default ToggleSwitch;
