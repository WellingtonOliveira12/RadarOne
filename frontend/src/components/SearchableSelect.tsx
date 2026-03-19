/**
 * SearchableSelect — A dropdown with type-to-search functionality.
 *
 * Used for city selection where the list can be large.
 * Filters options as the user types, supporting accent-insensitive matching.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  noOptionsText?: string;
  style?: React.CSSProperties;
  allowFreeText?: boolean; // for backward compat with legacy values
}

function removeDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = '',
  disabled = false,
  loading = false,
  loadingText = 'Loading...',
  noOptionsText = 'No options',
  style,
  allowFreeText = false,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter options based on search
  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const needle = removeDiacritics(search.trim().toLowerCase());
    return options.filter((opt) =>
      removeDiacritics(opt.toLowerCase()).includes(needle),
    );
  }, [options, search]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSelect = useCallback(
    (opt: string) => {
      onChange(opt);
      setIsOpen(false);
      setSearch('');
    },
    [onChange],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
      if (!isOpen) setIsOpen(true);
      if (allowFreeText) {
        onChange(e.target.value);
      }
    },
    [isOpen, allowFreeText, onChange],
  );

  const handleFocus = useCallback(() => {
    setIsOpen(true);
    setSearch('');
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setSearch('');
      }
      if (e.key === 'Enter' && filtered.length === 1) {
        e.preventDefault();
        handleSelect(filtered[0]);
      }
    },
    [filtered, handleSelect],
  );

  const displayValue = isOpen ? search : value;

  return (
    <div ref={containerRef} style={{ position: 'relative', ...style }}>
      <input
        ref={inputRef}
        type="text"
        value={displayValue}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? '' : (value || placeholder)}
        disabled={disabled}
        style={inputStyle}
        autoComplete="off"
      />
      {/* Dropdown arrow indicator */}
      {!disabled && (
        <span
          style={arrowStyle}
          onClick={() => {
            if (!disabled) {
              setIsOpen(!isOpen);
              inputRef.current?.focus();
            }
          }}
        >
          {'\u25BE'}
        </span>
      )}

      {isOpen && !disabled && (
        <div style={dropdownStyle}>
          {loading ? (
            <div style={messageStyle}>{loadingText}</div>
          ) : filtered.length === 0 ? (
            <div style={messageStyle}>{noOptionsText}</div>
          ) : (
            <div style={listStyle}>
              {filtered.map((opt) => (
                <div
                  key={opt}
                  style={{
                    ...optionStyle,
                    backgroundColor: opt === value ? '#e0f2fe' : undefined,
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(opt);
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLDivElement).style.backgroundColor = '#f0f9ff';
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLDivElement).style.backgroundColor =
                      opt === value ? '#e0f2fe' : '';
                  }}
                >
                  {opt}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 32px 10px 12px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '14px',
  outline: 'none',
  backgroundColor: 'white',
  boxSizing: 'border-box',
};

const arrowStyle: React.CSSProperties = {
  position: 'absolute',
  right: '10px',
  top: '50%',
  transform: 'translateY(-50%)',
  color: '#6b7280',
  fontSize: '14px',
  cursor: 'pointer',
  pointerEvents: 'auto',
  userSelect: 'none',
};

const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  right: 0,
  backgroundColor: 'white',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  marginTop: '4px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  zIndex: 50,
  maxHeight: '220px',
  overflow: 'hidden',
};

const listStyle: React.CSSProperties = {
  maxHeight: '220px',
  overflowY: 'auto',
};

const optionStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: '14px',
  cursor: 'pointer',
  transition: 'background-color 0.1s',
};

const messageStyle: React.CSSProperties = {
  padding: '12px',
  fontSize: '13px',
  color: '#9ca3af',
  textAlign: 'center',
};
