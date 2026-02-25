import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

function normalizeTag(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function TagsLookupField({
  label,
  value,
  onValueChange,
  options,
  selectedTags,
  onSelectedTagsChange,
  placeholder,
  noResultsText
}) {
  const inputRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [resultsStyle, setResultsStyle] = useState({});

  const selectedSet = useMemo(
    () => new Set((selectedTags || []).map((tag) => normalizeTag(tag).toLowerCase())),
    [selectedTags]
  );

  const filteredOptions = useMemo(() => {
    const query = String(value || "").trim().toLowerCase();
    const normalizedOptions = (options || [])
      .map((option) => normalizeTag(option))
      .filter((option) => option && !selectedSet.has(option.toLowerCase()));
    if (!query) return normalizedOptions.slice(0, 50);
    return normalizedOptions.filter((option) => option.toLowerCase().includes(query)).slice(0, 50);
  }, [options, selectedSet, value]);

  const addTag = (incomingTag) => {
    const nextTag = normalizeTag(incomingTag);
    if (!nextTag) return;
    const normalized = nextTag.toLowerCase();
    if (selectedSet.has(normalized)) {
      onValueChange("");
      return;
    }
    const suggested = (options || []).find((item) => normalizeTag(item).toLowerCase() === normalized);
    onSelectedTagsChange([...(selectedTags || []), suggested ? normalizeTag(suggested) : nextTag]);
    onValueChange("");
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const removeTag = (tagToRemove) => {
    const normalizedTarget = normalizeTag(tagToRemove).toLowerCase();
    onSelectedTagsChange((selectedTags || []).filter((tag) => normalizeTag(tag).toLowerCase() !== normalizedTarget));
  };

  const handleKeyDown = (event) => {
    if ((event.key === "Enter" || event.key === "," || event.key === "Tab") && String(value || "").trim()) {
      event.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        addTag(filteredOptions[highlightedIndex]);
        return;
      }
      addTag(value);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
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

    if (event.key === "Backspace" && !String(value || "").trim() && (selectedTags || []).length > 0) {
      const lastTag = selectedTags[selectedTags.length - 1];
      removeTag(lastTag);
      return;
    }

    if (event.key === "Escape") {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

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
  }, [isOpen, filteredOptions.length, value]);

  return (
    <div className="lookup-wrap">
      {label ? <label>{label}</label> : null}
      <div className="tags-lookup-control" onClick={() => inputRef.current?.focus()}>
        {(selectedTags || []).map((tag, index) => (
          <span key={`${tag}-${index}`} className="tags-lookup-pill">
            {tag}
            <button type="button" onClick={() => removeTag(tag)} aria-label={`remove ${tag}`}>
              ×
            </button>
          </span>
        ))}
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
          onBlur={() => setTimeout(() => setIsOpen(false), 120)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="tags-lookup-input"
        />
      </div>
      {isOpen
        ? createPortal(
            <div className="lookup-results" style={resultsStyle}>
              {filteredOptions.length > 0 ? (
                filteredOptions.map((item, index) => (
                  <button
                    key={`${item}-${index}`}
                    type="button"
                    className={`lookup-item ${highlightedIndex === index ? "active" : ""}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => addTag(item)}
                  >
                    {item}
                  </button>
                ))
              ) : (
                <div className="lookup-empty">{noResultsText}</div>
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

export default TagsLookupField;
