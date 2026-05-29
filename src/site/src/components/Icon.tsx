type IconProps = {
  name: "spark" | "archive" | "external" | "refresh" | "search";
  className?: string;
};

const paths: Record<IconProps["name"], string> = {
  spark: "M12 2l1.85 5.45L19.5 9.3l-5.65 1.85L12 16.6l-1.85-5.45L4.5 9.3l5.65-1.85L12 2zm7 11l.9 2.65L22.5 16.5l-2.6.85L19 20l-.9-2.65-2.6-.85 2.6-.85L19 13zM5 14l1.1 3.25L9.5 18.4l-3.4 1.1L5 23l-1.1-3.5-3.4-1.1 3.4-1.15L5 14z",
  archive: "M4 4h16v4H4V4zm1.5 6h13v10h-13V10zm4 2.75v2h5v-2h-5z",
  external: "M14 3h7v7h-2V6.41l-9.3 9.3-1.4-1.42 9.29-9.29H14V3zM5 5h6v2H7v10h10v-4h2v6H5V5z",
  refresh: "M17.65 6.35A8 8 0 104.1 13h2.05A6 6 0 1112 18a5.96 5.96 0 01-4.24-1.76L10 14H4V8l2.34 2.34A8 8 0 0117.65 6.35z",
  search: "M10 4a6 6 0 104.47 9.99l4.27 4.27 1.42-1.42-4.27-4.27A6 6 0 0010 4zm0 2a4 4 0 110 8 4 4 0 010-8z"
};

export const Icon = ({ name, className }: IconProps) => (
  <svg className={className} aria-hidden="true" viewBox="0 0 24 24" focusable="false">
    <path d={paths[name]} />
  </svg>
);
