'use client';

import React, { useEffect, useState } from 'react';

export default function TableOfContents({ contentSelector = '.editorial-content' }) {
  const [headings, setHeadings] = useState([]);
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    const extractHeadings = () => {
      const container = document.querySelector(contentSelector);
      if (!container) return;

      const elements = Array.from(container.querySelectorAll('h2, h3'));
      if (elements.length === 0) return;

      const headingData = elements.map((elem, index) => {
        let id = elem.id;
        if (!id) {
          const slugified = (elem.innerText || elem.textContent || '')
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-');
          id = slugified || `heading-${index}`;
          elem.id = id;
        }
        return {
          id,
          text: elem.innerText || elem.textContent,
          level: elem.tagName.toLowerCase()
        };
      });

      setHeadings(headingData);
    };

    // Run extraction immediately and on next tick to catch async DOM insertions
    extractHeadings();
    const timer = setTimeout(extractHeadings, 200);

    const handleScroll = () => {
      const headingsOnPage = Array.from(document.querySelectorAll(`${contentSelector} h2, ${contentSelector} h3`));
      if (headingsOnPage.length === 0) return;

      const scrollPos = window.scrollY + 120;
      let currentId = '';

      for (let i = 0; i < headingsOnPage.length; i++) {
        const el = headingsOnPage[i];
        if (el.offsetTop <= scrollPos) {
          currentId = el.id;
        }
      }

      if (currentId) {
        setActiveId(currentId);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [contentSelector]);

  if (headings.length === 0) return null;

  return (
    <nav className="editorial-toc" aria-label="Table of Contents">
      <h4 className="toc-title">IN THIS ARTICLE</h4>
      <ul className="toc-list">
        {headings.map((heading) => (
          <li 
            key={heading.id} 
            className={`toc-item ${heading.level === 'h3' ? 'toc-h3' : ''} ${activeId === heading.id ? 'active' : ''}`}
          >
            <a 
              href={`#${heading.id}`}
              onClick={(e) => {
                e.preventDefault();
                const element = document.getElementById(heading.id);
                if (element) {
                  const y = element.getBoundingClientRect().top + window.pageYOffset - 90;
                  window.scrollTo({ top: y, behavior: 'smooth' });
                }
              }}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
