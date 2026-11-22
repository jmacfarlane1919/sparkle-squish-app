export type FieldView = {
  id: string;
  label: string;
  fieldType: string;
  options: string;
  hidden: boolean;
  value: string;
};

const inputClass = "mt-1 h-11 w-full rounded-2xl border border-[#e4dced] bg-white px-3 text-base";

export function CustomFields({ fields }: { fields: FieldView[] }) {
  const shown = fields.filter((field) => !field.hidden);
  if (!shown.length) return null;
  return (
    <div className="space-y-3">
      {shown.map((field) => (
        <label key={field.id} className="block text-sm font-extrabold">
          {field.label}
          {field.fieldType === "yesno" ? (
            <select name={`custom:${field.id}`} className={inputClass} defaultValue={field.value || "no"}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          ) : field.fieldType === "dropdown" ? (
            <select name={`custom:${field.id}`} className={inputClass} defaultValue={field.value}>
              <option value="">Choose</option>
              {field.options.split("\n").map((option) => option.trim()).filter(Boolean).map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          ) : (
            <input
              name={`custom:${field.id}`}
              className={inputClass}
              defaultValue={field.value}
              type={field.fieldType === "date" ? "date" : field.fieldType === "url" ? "url" : field.fieldType === "number" || field.fieldType === "money" ? "text" : "text"}
              inputMode={field.fieldType === "money" || field.fieldType === "number" ? "decimal" : undefined}
            />
          )}
        </label>
      ))}
    </div>
  );
}
