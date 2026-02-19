import FormField from "./FormField";

function SelectField({ label, required = false, error = false, className = "", children, ...selectProps }) {
  return (
    <FormField label={label} required={required} error={error} className={className}>
      <select {...selectProps} required={required}>
        {children}
      </select>
    </FormField>
  );
}

export default SelectField;

