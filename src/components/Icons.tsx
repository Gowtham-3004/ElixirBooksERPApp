interface IconProps {
  size?: number;
  className?: string;
  color?: string;
}

const icon = (path: string) =>
  ({ size = 16, className = '', color = 'currentColor' }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {path.split('|').map((d, i) => <path key={i} d={d} />)}
    </svg>
  );

export const HomeIcon = icon('M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z|M9 22V12h6v10');
export const CheckCircleIcon = icon('M22 11.08V12a10 10 0 11-5.93-9.14|M22 4L12 14.01l-3-3');
export const UsersIcon = icon('M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2|M23 21v-2a4 4 0 00-3-3.87|M16 3.13a4 4 0 010 7.75');
export const ReceiptIcon = icon('M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z|M14 2v6h6|M16 13H8|M16 17H8|M10 9H8');
export const ShoppingCartIcon = icon('M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z|M3 6h18|M16 10a4 4 0 01-8 0');
export const PackageIcon = icon('M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z|M3.27 6.96L12 12.01l8.73-5.05|M12 22.08V12');
export const MonitorIcon = icon('M21 3H3a2 2 0 00-2 2v14a2 2 0 002 2h18a2 2 0 002-2V5a2 2 0 00-2-2z|M8 21h8|M12 17v4');
export const BookOpenIcon = icon('M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z|M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z');
export const BuildingIcon = icon('M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z|M9 22V12h6v10');
export const PercentIcon = icon('M19 5L5 19|M6.5 6.5m0 0a.5.5 0 100-1 .5.5 0 000 1|M17.5 17.5m0 0a.5.5 0 100-1 .5.5 0 000 1');
export const CreditCardIcon = icon('M1 4h22v16H1z|M1 10h22');
export const LayersIcon = icon('M12 2L2 7l10 5 10-5-10-5z|M2 17l10 5 10-5|M2 12l10 5 10-5');
export const BarChartIcon = icon('M18 20V10|M12 20V4|M6 20v-6');
export const TrendingUpIcon = icon('M23 6l-9.5 9.5-5-5L1 18|M17 6h6v6');
export const TrendingDownIcon = icon('M23 18l-9.5-9.5-5 5L1 6|M17 18h6v-6');
export const DatabaseIcon = icon('M21 5c0 1.66-4.03 3-9 3S3 6.66 3 5|M21 5c0-1.66-4.03-3-9-3S3 3.34 3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5z|M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3');
export const CogIcon = icon('M12 15a3 3 0 100-6 3 3 0 000 6z|M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z');
export const BellIcon = icon('M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9|M13.73 21a2 2 0 01-3.46 0');
export const SearchIcon = icon('M11 19a8 8 0 100-16 8 8 0 000 16z|M21 21l-4.35-4.35');
export const FilterIcon = icon('M22 3H2l8 9.46V19l4 2v-8.54L22 3z');
export const DownloadIcon = icon('M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4|M7 10l5 5 5-5|M12 15V3');
export const UploadIcon = icon('M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4|M17 8l-5-5-5 5|M12 3v12');
export const PlusIcon = icon('M12 5v14|M5 12h14');
export const MoreVertIcon = icon('M12 13a1 1 0 100-2 1 1 0 000 2|M12 6a1 1 0 100-2 1 1 0 000 2|M12 20a1 1 0 100-2 1 1 0 000 2');
export const LockIcon = icon('M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2z|M7 11V7a5 5 0 0110 0v4');
export const ChevronDownIcon = icon('M6 9l6 6 6-6');
export const ChevronRightIcon = icon('M9 18l6-6-6-6');
export const ArrowLeftIcon = icon('M19 12H5|M12 19l-7-7 7-7');
export const LinkIcon = icon('M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71|M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71');
export const ArrowsSwapIcon = icon('M7 16V4m0 0L3 8m4-4l4 4|M17 8v12m0 0l4-4m-4 4l-4-4');
export const ShieldCheckIcon = icon('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z|M9 12l2 2 4-4');
export const XIcon = icon('M18 6L6 18|M6 6l12 12');
export const MenuIcon = icon('M4 6h16|M4 12h16|M4 18h16');
export const HelpCircleIcon = icon('M12 22a10 10 0 100-20 10 10 0 000 20z|M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3|M12 17h.01');
export const UserIcon = icon('M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2|M12 11a4 4 0 100-8 4 4 0 000 8');
export const SortIcon = icon('M3 6h18|M6 12h12|M9 18h6');
export const ColumnsIcon = icon('M12 3h7a2 2 0 012 2v14a2 2 0 01-2 2h-7m0-18H5a2 2 0 00-2 2v14a2 2 0 002 2h7m0-18v18');
export const PrintIcon = icon('M6 9V2h12v7|M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2|M6 14h12v8H6z');
export const SendIcon = icon('M22 2L11 13|M22 2L15 22 11 13 2 9l20-7z');
export const FileTextIcon = icon('M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z|M14 2v6h6|M16 13H8|M16 17H8|M10 9H8');
export const InboxIcon = icon('M22 12h-6l-2 3h-4l-2-3H2|M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z');
export const RefreshIcon = icon('M23 4v6h-6|M1 20v-6h6|M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15');
export const EyeIcon = icon('M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z|M12 12m-3 0a3 3 0 106 0 3 3 0 00-6 0');
export const EditIcon = icon('M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7|M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z');
export const CheckIcon = icon('M20 6L9 17l-5-5');

// Feedback, state and object icons used where glyph characters and emoji used to stand in.
export const InfoCircleIcon = icon('M12 22a10 10 0 100-20 10 10 0 000 20z|M12 16v-4|M12 8h.01');
export const AlertTriangleIcon = icon('M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z|M12 9v4|M12 17h.01');
export const AlertCircleIcon = icon('M12 22a10 10 0 100-20 10 10 0 000 20z|M12 8v4|M12 16h.01');
export const XCircleIcon = icon('M12 22a10 10 0 100-20 10 10 0 000 20z|M15 9l-6 6|M9 9l6 6');
export const BanIcon = icon('M12 22a10 10 0 100-20 10 10 0 000 20z|M4.93 4.93l14.14 14.14');
export const CircleIcon = icon('M12 22a10 10 0 100-20 10 10 0 000 20z');
export const CircleDotIcon = icon('M12 22a10 10 0 100-20 10 10 0 000 20z|M12 15a3 3 0 100-6 3 3 0 000 6z');
export const MinusIcon = icon('M5 12h14');
export const ArrowRightIcon = icon('M5 12h14|M12 5l7 7-7 7');
export const ChevronLeftIcon = icon('M15 18l-6-6 6-6');
export const CornerUpLeftIcon = icon('M9 14L4 9l5-5|M20 20v-7a4 4 0 00-4-4H4');
export const ClipboardIcon = icon('M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2|M9 2h6a1 1 0 011 1v2a1 1 0 01-1 1H9a1 1 0 01-1-1V3a1 1 0 011-1z');
export const CompassIcon = icon('M12 22a10 10 0 100-20 10 10 0 000 20z|M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z');
export const MailIcon = icon('M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z|M22 6l-10 7L2 6');
export const FlagIcon = icon('M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z|M4 22v-7');
export const HashIcon = icon('M4 9h16|M4 15h16|M10 3L8 21|M16 3l-2 18');
export const PieChartIcon = icon('M21.21 15.89A10 10 0 118 2.83|M22 12A10 10 0 0012 2v10z');
export const ClockIcon = icon('M12 22a10 10 0 100-20 10 10 0 000 20z|M12 6v6l4 2');
export const ScissorsIcon = icon('M6 9a3 3 0 100-6 3 3 0 000 6z|M6 21a3 3 0 100-6 3 3 0 000 6z|M20 4L8.12 15.88|M14.47 14.48L20 20|M8.12 8.12L12 12');
export const FolderIcon = icon('M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z');
export const ZapIcon = icon('M13 2L3 14h9l-1 8 10-12h-9l1-8z');
export const WalletIcon = icon('M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z|M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z|M16 14h.01');
export const GitBranchIcon = icon('M6 3v12|M18 9a3 3 0 100-6 3 3 0 000 6z|M6 21a3 3 0 100-6 3 3 0 000 6z|M18 9a9 9 0 01-9 9');
export const StarIcon = icon('M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z');
export const BriefcaseIcon = icon('M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z|M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16');
export const FactoryIcon = icon('M2 20a2 2 0 002 2h16a2 2 0 002-2V8l-7 5V8l-7 5V4a2 2 0 00-2-2H4a2 2 0 00-2 2z|M17 18h1|M12 18h1|M7 18h1');
export const MapPinIcon = icon('M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z|M12 13a3 3 0 100-6 3 3 0 000 6z');
export const CalendarIcon = icon('M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2z|M16 2v4|M8 2v4|M3 10h18');
export const SkipForwardIcon = icon('M5 4l10 8-10 8V4z|M19 5v14');
export const PartyIcon = icon('M5.8 11.3L2 22l10.7-3.8|M4 3h.01|M22 8h.01|M15 2h.01|M22 20h.01|M22 2l-2.24.75a2.9 2.9 0 000 5.5L22 9|M18 2l.75 2.24a2.9 2.9 0 005.5 0L25 2|M2 18l2.24-.75a2.9 2.9 0 000-5.5L2 11|M14.5 5.5l1.28 3.83a2 2 0 001.27 1.27L21 12l-3.95 1.4a2 2 0 00-1.27 1.27L14.5 18.5l-1.28-3.83a2 2 0 00-1.27-1.27L8 12l3.95-1.4a2 2 0 001.27-1.27z');
