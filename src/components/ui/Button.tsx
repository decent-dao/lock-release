function Button({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean,
  onClick: () => void,
  children: React.ReactNode,
}) {
  return (
    <button
      className={`px-4 py-2 border rounded ${disabled ? "text-gray-400 cursor-default" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export default Button;
