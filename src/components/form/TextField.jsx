import FormField from "./FormField";

function TextField({ label, required = false, error = false, className = "", ...inputProps }) {
  return (
    <FormField label={label} required={required} error={error} className={className}>
      <input {...inputProps} required={required} />
    </FormField>
  );
}

export default TextField;

