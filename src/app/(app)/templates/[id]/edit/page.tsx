export const dynamic = 'force-dynamic';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { TemplateEditorClient } from './TemplateEditorClient';

type Props = { params: Promise<{ id: string }> };

export default async function TemplateEditPage({ params }: Props) {
  const { id } = await params;
  const template = await db.reportTemplate.findUnique({ where: { id } });
  if (!template) notFound();
  return <TemplateEditorClient template={template} />;
}
