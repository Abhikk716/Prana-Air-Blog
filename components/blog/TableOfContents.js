'use client';

import React, { useEffect, useState } from 'react';

export default function TableOfContents({ contentSelector }) {
  const [headings, setHeadings] = useState([]);
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    // Select all h2 elements within the content
    const elements = Array.from(document.querySelectorAll(`${contentSelector} h2`));
    
    // Add IDs to h2 elements if they don't have one, and build the headings list
    const headingData = elements.map((elem, index) => {
      let id = elem.id;
      if (!id) {
        id = `heading-${index}`;
        elem.id = id;
      }
      return {
        id,
        text: elem.innerText || elem.textContent,
        top: elem.offsetTop
      };
    });

    setHeadings(headingData);

    const handleScroll = () => {
      const scrollPosition = window.scrollY + 100; // Offset for header/padding
      
      let currentActiveId = '';
      for (const heading of headingData) {
        const element = document.getElementById(heading.id);
        if (element && element.offsetTop <= scrollPosition) {
          currentActiveId = heading.id;
        }
      }
      
      setActiveId(currentActiveId);
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Call once to set initial active state

    return () => window.removeEventListener('scroll', handleScroll);
  }, [contentSelector]);

  if (headings.length === 0) return null;

  return (
    <div className="editorial-toc">
      <h4 className="toc-title">IN THIS ARTICLE</h4>
      <ul className="toc-list">
        {headings.map((heading) => (
          <li key={heading.id} className={`toc-item ${activeId === heading.id ? 'active' : ''}`}>
            <a 
              href={`#${heading.id}`}
              onClick={(e) => {
                e.preventDefault();
                const element = document.getElementById(heading.id);
                if (element) {
                  window.scrollTo({
                    top: element.offsetTop - 80,
                    behavior: 'smooth'
                  });
                }
              }}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
