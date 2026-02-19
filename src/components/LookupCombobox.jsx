import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  onClearSelection,
  required = false,
  hasError = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const inputRef = useRef(null);
  const [resultsStyle, setResultsStyle] = useState({});

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

  useEffect(() => {
    if (!isOpen || selectedPillText) return;

    const updatePosition = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      setResultsStyle({
        position: "fixed",
        top: `${rect.bottom + 2}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        zIndex: 1300
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, selectedPillText, value, filteredOptions.length]);

  return (
    <div className={`lookup-wrap ${required ? "required" : ""} ${hasError ? "has-error" : ""}`}>
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
            ref={inputRef}
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
      {!selectedPillText && isOpen
        ? createPortal(
            <div className="lookup-results" style={resultsStyle}>
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
            </div>,
            document.body
          )
        : null}
      {renderCreateModal
        ? createPortal(
            renderCreateModal({
              isOpen: isCreateModalOpen,
              onClose: () => setIsCreateModalOpen(false),
              onCreated: async (record) => {
                try {
                  if (onCreateRecord) {
                    await onCreateRecord(record);
                  }
                } finally {
                  setIsCreateModalOpen(false);
                }
              }
            }),
            document.body
          )
        : null}
    </div>
  );
}

export default LookupCombobox;
