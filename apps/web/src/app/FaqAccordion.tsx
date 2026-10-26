'use client';

import React, { useState } from 'react';
import styles from './home.module.css';

type FAQ = { question: string; answer: string };

export default function FaqAccordion({ faqs }: { faqs: FAQ[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className={styles.faqList}>
      {faqs.map((faq, index) => {
        const isOpen = openIndex === index;
        const answerId = `dz-faq-answer-${index}`;
        return (
          <article className={styles.faqItem} key={faq.question} data-dz-reveal data-dz-reveal-delay={index * 65}>
            <button
              type="button"
              className={styles.faqQuestion}
              aria-expanded={isOpen}
              aria-controls={answerId}
              onClick={() => setOpenIndex((current) => current === index ? null : index)}
            >
              <span className={styles.faqIndex}>{String(index + 1).padStart(2, '0')}</span>
              <span>{faq.question}</span>
              <span className={`${styles.faqPlus} ${isOpen ? styles.faqPlusOpen : ''}`} aria-hidden="true">+</span>
            </button>
            <div id={answerId} className={`${styles.faqAnswer} ${isOpen ? styles.faqAnswerOpen : ''}`} aria-hidden={!isOpen}>
              <div className={styles.faqAnswerInner}>
                <p>{faq.answer}</p>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
