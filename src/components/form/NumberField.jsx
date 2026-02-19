import FormField from "./FormField";

function NumberField({ label, required = false, error = false, className = "", ...inputProps }) {
  return (
    <FormField label={label} required={required} error={error} className={className}>
      <input type="number" {...inputProps} required={required} />
    </FormField>
  );
}

export default NumberField;

