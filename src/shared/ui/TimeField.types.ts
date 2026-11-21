export interface TimeFieldPalette {
  cell: string;
  border: string;
  ink: string;
  muted: string;
}

export interface TimeFieldProps {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  /** Hora con la que se abre el selector si el campo está vacío. */
  suggested?: string;
  lightPalette?: TimeFieldPalette;
}
