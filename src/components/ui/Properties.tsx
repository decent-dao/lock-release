function Property({
  title,
  children,
}: {
  title: string,
  children: React.ReactNode,
}) {
  return (
    <div className="mb-2">
      <div className="text-base sm:text-lg">{title}</div>
      <div>{children}</div>
    </div>
  );
}

function AmountProperty({
  title,
  value,
  symbol,
}: {
  title: string,
  value: string | undefined,
  symbol: string,
}) {
  return (
    <Property title={title}>
      <span className="font-mono text-xs sm:text-sm">{value}</span> <span>{symbol}</span>
    </Property>
  );
}

export {
  Property,
  AmountProperty,
}