import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FiMoreVertical } from "react-icons/fi";

function RowActionsMenu({ actions }) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onClickOutside = (event) => {
      if (!wrapRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    window.addEventListener("click", onClickOutside);
    return () => window.removeEventListener("click", onClickOutside);
  }, []);

  return (
    <div className="row-actions-wrap" ref={wrapRef}>
      <button type="button" className="row-menu-btn" onClick={() => setIsOpen((prev) => !prev)} aria-label="Actions">
        <FiMoreVertical />
      </button>

      {isOpen && (
        <div className="row-menu-dropdown">
          {actions.map((action) =>
            action.to ? (
              <Link key={action.key} to={action.to} className={`row-menu-item ${action.danger ? "danger" : ""}`}>
                {action.label}
              </Link>
            ) : (
              <button
                key={action.key}
                type="button"
                className={`row-menu-item ${action.danger ? "danger" : ""}`}
                onClick={() => {
                  action.onClick?.();
                  setIsOpen(false);
                }}
                disabled={action.disabled}
              >
                {action.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

export default RowActionsMenu;
