'use client';

import React, { useEffect, useRef } from 'react';
import Swiper from 'swiper';
import { Navigation, Pagination, Autoplay } from 'swiper/modules';

export default function RichContent({ html }) {
  const containerRef = useRef(null);
  const swipersRef = useRef([]);

  useEffect(() => {
    // Cleanup previous swiper instances if re-rendering
    swipersRef.current.forEach(swiper => swiper.destroy(true, true));
    swipersRef.current = [];

    if (containerRef.current) {
      // 1. Find all gallery boxes
      const galleryBoxes = containerRef.current.querySelectorAll('.prana-gallery-box');
      
      galleryBoxes.forEach((box) => {
        // Find all images or videos inside this box
        const mediaElements = box.querySelectorAll('img, video');
        if (mediaElements.length === 0) return; // Skip if empty
        
        // Build the Swiper DOM structure
        const swiperContainer = document.createElement('div');
        swiperContainer.className = 'swiper';
        
        const swiperWrapper = document.createElement('div');
        swiperWrapper.className = 'swiper-wrapper';
        
        mediaElements.forEach((media) => {
          const slide = document.createElement('div');
          slide.className = 'swiper-slide';
          
          // Clone the media element to clean up any weird editor wrappers
          const mediaClone = media.cloneNode(true);
          // Remove any hardcoded margins from editor
          mediaClone.style.margin = '0'; 
          mediaClone.style.display = 'block';
          mediaClone.style.width = '100%';
          mediaClone.style.height = 'auto';
          
          slide.appendChild(mediaClone);
          swiperWrapper.appendChild(slide);
        });
        
        swiperContainer.appendChild(swiperWrapper);
        
        // Add Pagination & Navigation
        const pagination = document.createElement('div');
        pagination.className = 'swiper-pagination';
        swiperContainer.appendChild(pagination);
        
        const nextBtn = document.createElement('div');
        nextBtn.className = 'swiper-button-next';
        swiperContainer.appendChild(nextBtn);
        
        const prevBtn = document.createElement('div');
        prevBtn.className = 'swiper-button-prev';
        swiperContainer.appendChild(prevBtn);
        
        // Replace the original gallery box with our new Swiper container
        box.parentNode.replaceChild(swiperContainer, box);
      });

      // 2. Initialize Swiper on all .swiper elements
      const swiperElements = containerRef.current.querySelectorAll('.swiper');
      
      swiperElements.forEach((element) => {
        const swiperInstance = new Swiper(element, {
          modules: [Navigation, Pagination, Autoplay],
          slidesPerView: 1,
          spaceBetween: 30,
          loop: true,
          autoHeight: true, // Adjust height
          pagination: {
            el: element.querySelector('.swiper-pagination'),
            clickable: true,
          },
          navigation: {
            nextEl: element.querySelector('.swiper-button-next'),
            prevEl: element.querySelector('.swiper-button-prev'),
          },
          autoplay: {
            delay: 5000,
            disableOnInteraction: false,
          },
          on: {
            init: function () {
              // Wait for images to load to recalculate height
              const imgs = element.querySelectorAll('img');
              imgs.forEach(img => {
                if (img.complete) {
                  this.updateAutoHeight();
                } else {
                  img.addEventListener('load', () => this.updateAutoHeight());
                }
              });
            },
          }
        });
        swipersRef.current.push(swiperInstance);
      });

      // 3. FAQ Accordion Logic (Exclusive Open)
      const faqBlocks = containerRef.current.querySelectorAll('.prana-faq-block');
      faqBlocks.forEach(block => {
        const detailsElements = block.querySelectorAll('details.prana-faq-item');
        detailsElements.forEach((details) => {
          details.addEventListener('toggle', (e) => {
            if (details.open) {
              detailsElements.forEach(otherDetails => {
                if (otherDetails !== details && otherDetails.open) {
                  otherDetails.removeAttribute('open');
                }
              });
            }
          });
        });
      });
    }

    return () => {
      swipersRef.current.forEach(swiper => swiper.destroy(true, true));
    };
  }, [html]);

  return (
    <div
      ref={containerRef}
      className="editorial-content prose-editorial"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
