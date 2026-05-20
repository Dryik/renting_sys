import { z } from "zod";
import type { PageRequest } from "./pagination";

const optionalTextField = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .transform((value) => (value === "" ? null : value));

export const customerInputSchema = z.object({
  fullName: z.string().trim().min(1, "Customer name is required.").max(120),
  phone: z.string().trim().min(1, "Phone is required.").max(40),
  secondaryPhone: z.string().trim().max(40).nullable(),
  nationalId: z.string().trim().max(80).nullable(),
  driverLicenseNo: z.string().trim().max(80).nullable(),
  licenseExpiryDate: z.string().trim().max(20).nullable(),
  address: z.string().trim().max(250).nullable(),
  notes: z.string().trim().max(500).nullable(),
});

export const customerFormSchema = z
  .object({
    fullName: z.string().trim().min(1, "Customer name is required.").max(120),
    phone: z.string().trim().min(1, "Phone is required.").max(40),
    secondaryPhone: optionalTextField(40),
    nationalId: optionalTextField(80),
    driverLicenseNo: optionalTextField(80),
    licenseExpiryDate: optionalTextField(20),
    address: optionalTextField(250),
    notes: optionalTextField(500),
  })
  .transform((values) => customerInputSchema.parse(values));

export type CustomerInput = z.infer<typeof customerInputSchema>;

export type CustomerListRequest = PageRequest;

export type CustomerRecord = CustomerInput & {
  id: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CustomerFormValues = {
  fullName: string;
  phone: string;
  secondaryPhone: string;
  nationalId: string;
  driverLicenseNo: string;
  licenseExpiryDate: string;
  address: string;
  notes: string;
};

export const emptyCustomerFormValues: CustomerFormValues = {
  fullName: "",
  phone: "",
  secondaryPhone: "",
  nationalId: "",
  driverLicenseNo: "",
  licenseExpiryDate: "",
  address: "",
  notes: "",
};

export function customerToFormValues(
  customer: CustomerRecord,
): CustomerFormValues {
  return {
    fullName: customer.fullName,
    phone: customer.phone,
    secondaryPhone: customer.secondaryPhone ?? "",
    nationalId: customer.nationalId ?? "",
    driverLicenseNo: customer.driverLicenseNo ?? "",
    licenseExpiryDate: customer.licenseExpiryDate ?? "",
    address: customer.address ?? "",
    notes: customer.notes ?? "",
  };
}
