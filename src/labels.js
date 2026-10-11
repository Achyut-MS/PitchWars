export function itemLabel(item, idea, choice) {
  if (/^O0[123]$/.test(item.id)) return `Fix: ${idea.risks[Number(item.id[2]) - 1]}`;
  if (item.id === 'M02') return choice ? `Brand name: ${idea.brands[choice - 1]}` : 'Brand name';
  if (item.id === 'M03') return choice ? `Tagline: ${idea.taglines[choice - 1]}` : 'Tagline';
  return item.option && item.option !== 'Standard' ? `${item.name} (${item.option})` : item.name;
}
