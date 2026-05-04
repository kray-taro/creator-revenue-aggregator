'use client';
import React from 'react';
import { cn } from '@/utils/cn';
import styles from './Card.module.css';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'elevated' | 'flat' | 'green' | 'yellow' | 'red';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  as?: React.ElementType;
}

export function Card({ children, className, variant = 'default', padding = 'md', as: Tag = 'div' }: CardProps) {
  return (
    <Tag className={cn(styles.card, styles[variant], styles[`pad-${padding}`], className)}>
      {children}
    </Tag>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn(styles.header, className)}>{children}</div>;
}

export function CardBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn(styles.body, className)}>{children}</div>;
}

export function CardFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn(styles.footer, className)}>{children}</div>;
}
