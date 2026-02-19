import FormField from "./FormField";

function DateField({ label, required = false, error = false, className = "", ...inputProps }) {
  return (
    <FormField label={label} required={required} error={error} className={className}>
      <input type="date" {...inputProps} required={required} />
    </FormField>
  );
}

export default DateField;

