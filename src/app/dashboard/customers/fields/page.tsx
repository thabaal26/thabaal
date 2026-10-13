import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { businessTypeOf } from "@/lib/business-types";
import { readFields } from "@/lib/custom-fields";
import { db } from "@/lib/db";
import { getScope } from "@/lib/session";
import { FieldsEditor } from "./fields-editor";

export const metadata: Metadata = { title: "Custom fields" };

export default async function CustomFieldsPage() {
  const scope = await getScope();
  if (!scope.clientId || !scope.canManage) redirect("/dashboard/customers");
  const client = await db.client.findUnique({ where: { id: scope.clientId }, select: { customFields: true, businessType: true } });
  const type = businessTypeOf(client?.businessType);
  return (
    <>
      <PageHeader
        title="Custom fields"
        back={{ href: "/dashboard/customers", label: "Customers" }}
        description="Extra details your business keeps on customers and orders. They show in the customer and order forms and in CSV exports."
      />
      <Card className="max-w-4xl">
        <CardHeader title="Fields" description={type ? `Business type: ${type.label}` : undefined} />
        <div className="p-4 sm:p-5">
          <FieldsEditor initial={readFields(client?.customFields)} />
        </div>
      </Card>
    </>
  );
}
