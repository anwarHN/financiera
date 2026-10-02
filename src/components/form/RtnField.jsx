import TextField from "./TextField";
import { useI18n } from "../../contexts/I18nContext";

export default function RtnField({ value, onChange, disabled = false }) {
  const { t } = useI18n();
  return <TextField label={t("common.rtn")} name="rtn" type="text" inputMode="numeric"
    pattern="[0-9]{14}" minLength={14} maxLength={14} title={t("common.rtnHint")}
    placeholder={t("common.rtnHint")} value={value} onChange={onChange} disabled={disabled} />;
}
