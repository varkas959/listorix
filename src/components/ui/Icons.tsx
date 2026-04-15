import React from 'react';
import Svg, { Path, Circle, Polyline, Line, Rect } from 'react-native-svg';
import { Colors } from '../../constants/colors';

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

function icon(size: number, color: string, sw: number, children: React.ReactNode) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </Svg>
  );
}

export function IconList({ size = 22, color = Colors.textTertiary, strokeWidth = 2 }: IconProps) {
  return icon(size, color, strokeWidth, <>
    <Line x1="8" y1="6"  x2="21" y2="6"  />
    <Line x1="8" y1="12" x2="21" y2="12" />
    <Line x1="8" y1="18" x2="21" y2="18" />
    <Line x1="3" y1="6"  x2="3.01" y2="6"  />
    <Line x1="3" y1="12" x2="3.01" y2="12" />
    <Line x1="3" y1="18" x2="3.01" y2="18" />
  </>);
}

export function IconHistory({ size = 22, color = Colors.textTertiary, strokeWidth = 2 }: IconProps) {
  return icon(size, color, strokeWidth, <>
    <Path d="M3 3v5h5" />
    <Path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
    <Path d="M12 7v5l4 2" />
  </>);
}

export function IconInsights({ size = 22, color = Colors.textTertiary, strokeWidth = 2 }: IconProps) {
  return icon(size, color, strokeWidth, <>
    <Line x1="18" y1="20" x2="18" y2="10" />
    <Line x1="12" y1="20" x2="12" y2="4"  />
    <Line x1="6"  y1="20" x2="6"  y2="14" />
  </>);
}

export function IconProfile({ size = 22, color = Colors.textTertiary, strokeWidth = 2 }: IconProps) {
  return icon(size, color, strokeWidth, <>
    <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <Circle cx="12" cy="7" r="4" />
  </>);
}

export function IconMic({ size = 24, color = '#fff', strokeWidth = 2 }: IconProps) {
  return icon(size, color, strokeWidth, <>
    <Rect x="9" y="2" width="6" height="11" rx="3" />
    <Path d="M5 10a7 7 0 0 0 14 0" />
    <Line x1="12" y1="17" x2="12" y2="21" />
    <Line x1="9"  y1="21" x2="15" y2="21" />
  </>);
}

export function IconScan({ size = 24, color = '#fff', strokeWidth = 2 }: IconProps) {
  return icon(size, color, strokeWidth, <>
    <Path d="M3 7V5a2 2 0 0 1 2-2h2" />
    <Path d="M17 3h2a2 2 0 0 1 2 2v2" />
    <Path d="M21 17v2a2 2 0 0 1-2 2h-2" />
    <Path d="M7 21H5a2 2 0 0 1-2-2v-2" />
    <Line x1="7" y1="12" x2="17" y2="12" />
  </>);
}

export function IconPen({ size = 24, color = '#fff', strokeWidth = 2 }: IconProps) {
  return icon(size, color, strokeWidth, <>
    <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </>);
}

export function IconPlus({ size = 28, color = '#fff', strokeWidth = 2.5 }: IconProps) {
  return icon(size, color, strokeWidth, <>
    <Line x1="12" y1="5"  x2="12" y2="19" />
    <Line x1="5"  y1="12" x2="19" y2="12" />
  </>);
}

export function IconClose({ size = 20, color = Colors.textSecondary, strokeWidth = 2 }: IconProps) {
  return icon(size, color, strokeWidth, <>
    <Line x1="18" y1="6" x2="6" y2="18" />
    <Line x1="6" y1="6" x2="18" y2="18" />
  </>);
}

export function IconCheck({ size = 13, color = '#fff', strokeWidth = 2 }: IconProps) {
  return icon(size, color, strokeWidth, <>
    <Polyline points="4 7 9 12 20 3" />
  </>);
}

export function IconChevronDown({ size = 18, color = Colors.textTertiary, strokeWidth = 2.2 }: IconProps) {
  return icon(size, color, strokeWidth, <>
    <Polyline points="6 9 12 15 18 9" />
  </>);
}

export function IconCart({ size = 64, color = Colors.textTertiary, strokeWidth = 1.5 }: IconProps) {
  return icon(size, color, strokeWidth, <>
    <Circle cx="9" cy="21" r="1" />
    <Circle cx="20" cy="21" r="1" />
    <Path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
  </>);
}

export function IconCamera({ size = 24, color = '#fff', strokeWidth = 2 }: IconProps) {
  return icon(size, color, strokeWidth, <>
    <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <Circle cx="12" cy="13" r="4" />
  </>);
}

export function IconGallery({ size = 24, color = '#fff', strokeWidth = 2 }: IconProps) {
  return icon(size, color, strokeWidth, <>
    <Rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <Circle cx="8.5" cy="8.5" r="1.5" />
    <Polyline points="21 15 16 10 5 21" />
  </>);
}

// Two people — used for the family share entry point
export function IconUser({ size = 22, color = Colors.textTertiary, strokeWidth = 2 }: IconProps) {
  return icon(size, color, strokeWidth, <>
    <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <Circle cx="12" cy="7" r="4" />
  </>);
}

export function IconUsers({ size = 22, color = Colors.textTertiary, strokeWidth = 2 }: IconProps) {
  return icon(size, color, strokeWidth, <>
    <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <Circle cx="9" cy="7" r="4" />
    <Path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </>);
}

// Share / upload arrow — used inside the share sheet CTA
export function IconShareArrow({ size = 18, color = '#fff', strokeWidth = 2 }: IconProps) {
  return icon(size, color, strokeWidth, <>
    <Path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <Polyline points="16 6 12 2 8 6" />
    <Line x1="12" y1="2" x2="12" y2="15" />
  </>);
}
