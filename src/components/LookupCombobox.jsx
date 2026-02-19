import { useMemo, useState } from "react";

function LookupCombobox({
  label,
  value,
  onValueChange,
  options,
  getOptionLabel,
  onSelect,
  placeholder,
  addButton,
  renderCreateModal,
  onCreateRecord,
  noResultsText,
  selectedPillText,
  onClearSelection
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const filteredOptions = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return options.slice(0, 50);
    return options.filter((item) => getOptionLabel(item).toLowerCase().includes(query)).slice(0, 50);
  }, [getOptionLabel, options, value]);

  const handleKeyDown = (event) => {
    if (!isOpen) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        setIsOpen(true);
        setHighlightedIndex(filteredOptions.length > 0 ? 0 : -1);
        event.preventDefault();
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (filteredOptions.length === 0) return;
      setHighlightedIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (filteredOptions.length === 0) return;
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
      return;
    }

    if (event.key === "Enter") {
      if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        event.preventDefault();
        onSelect(filteredOptions[highlightedIndex]);
        setIsOpen(false);
      }
      return;
    }

    if (event.key === "Escape") {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  return (
    <div className="lookup-wrap">
      {label ? <label>{label}</label> : null}
      <div className="lookup-input-row">
        {selectedPillText ? (
          <div className="lookup-selected-pill">
            <span>{selectedPillText}</span>
            {onClearSelection ? (
              <button
                type="button"
                onClick={() => {
                  onClearSelection();
                  setIsOpen(false);
                  setHighlightedIndex(-1);
                }}
                aria-label="clear selected"
              >
                ×
              </button>
            ) : null}
          </div>
        ) : (
          <input
            value={value}
            onChange={(event) => {
              onValueChange(event.target.value);
              setIsOpen(true);
              setHighlightedIndex(0);
            }}
            onFocus={() => {
              setIsOpen(true);
              setHighlightedIndex(filteredOptions.length > 0 ? 0 : -1);
            }}
            onClick={() => {
              setIsOpen(true);
              setHighlightedIndex(filteredOptions.length > 0 ? 0 : -1);
            }}
            onBlur={() => setTimeout(() => setIsOpen(false), 120)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
          />
        )}
        {addButton ? <div className="lookup-input-action">{addButton}</div> : null}
        {!addButton && renderCreateModal ? (
          <div className="lookup-input-action">
            <button type="button" className="button-secondary lookup-add-button" onClick={() => setIsCreateModalOpen(true)} title="create">
              +
            </button>
          </div>
        ) : null}
      </div>
      {!selectedPillText && isOpen && (
        <div className="lookup-results">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={`lookup-item ${highlightedIndex === index ? "active" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(item);
                  setIsOpen(false);
                }}
              >
                {getOptionLabel(item)}
              </button>
            ))
          ) : (
            <div className="lookup-empty">{noResultsText}</div>
          )}
        </div>
      )}
      {renderCreateModal
        ? renderCreateModal({
            isOpen: isCreateModalOpen,
            onClose: () => setIsCreateModalOpen(false),
            onCreated: (record) => {
              onCreateRecord?.(record);
              setIsCreateModalOpen(false);
            }
          })
        : null}
    </div>
  );
}

export default LookupCombobox;
