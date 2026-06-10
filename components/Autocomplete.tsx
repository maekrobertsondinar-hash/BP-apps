
import React, { useState, useEffect, useRef } from 'react';

interface AutocompleteProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
}

const Autocomplete: React.FC<AutocompleteProps> = ({ label, value, onChange, suggestions }) => {
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const userInput = e.target.value;
    onChange(userInput);

    if (userInput.length > 0) {
      const filtered = suggestions.filter(
        suggestion => suggestion.toLowerCase().includes(userInput.toLowerCase())
      );
      setFilteredSuggestions(filtered);
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    onChange(suggestion);
    setShowSuggestions(false);
  };

  return (
    <div className="flex flex-col gap-1.5 relative" ref={containerRef}>
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</label>
      <input
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={() => value.length > 0 && setShowSuggestions(true)}
        className="premium-input border border-gray-200 px-4 py-2.5 rounded-lg focus:outline-none bg-gray-50 text-gray-900 placeholder-gray-400 w-full transition-all"
        placeholder="Commencez à taper une fonction..."
      />
      {showSuggestions && filteredSuggestions.length > 0 && (
        <ul className="absolute z-50 top-[100%] left-0 w-full bg-white border border-gray-200 shadow-xl max-h-48 overflow-y-auto rounded-xl mt-1 py-1">
          {filteredSuggestions.map((suggestion, index) => (
            <li
              key={index}
              onClick={() => handleSuggestionClick(suggestion)}
              className="px-4 py-2 hover:bg-[#1A56DB] hover:text-white cursor-pointer text-sm font-medium transition-colors text-gray-700"
            >
              {suggestion}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Autocomplete;
