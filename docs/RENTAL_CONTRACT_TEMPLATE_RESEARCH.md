# Rental Contract Template Research

Date: 2026-05-29

Purpose: define a printable rental contract template for cars and motorcycles with dynamic prefilled customer, vehicle, employee, and company information.

This is a product and implementation template, not legal advice. Final wording should be reviewed against the shop's local law, insurance policy, and company rules before client delivery.

## Research Summary

Common vehicle rental agreement templates include these sections:

- Parties and contact details.
- Rental vehicle identification: make, model, year, VIN, plate, color, mileage, fuel, and existing damage.
- Rental period: start, expected return, pickup/return location.
- Use restrictions: authorized drivers/riders, geographic limits, lawful use, no sub-rental.
- Pricing: daily rate, deposit, included mileage, extra mileage, fuel, late return, cleaning, damage, and optional fees.
- Insurance or waiver choices: renter insurance, shop-provided insurance, CDW/LDW where applicable, exclusions.
- Condition and handover: odometer, fuel, damage notes/photos, accessories/keys.
- Accident/theft procedure: stop using vehicle if unsafe, contact shop, police report when needed.
- Signatures: customer and authorized shop representative.

Sources used:

- PandaDoc car rental agreement template: vehicle identification, rental term, use, mileage, fees, security deposit, insurance, indemnification, jurisdiction, signatures. <https://www.pandadoc.com/free-car-rental-agreement-template/>
- TemplateRoller vehicle rental agreement overview: party details, vehicle description, existing damage, duration, scope of use, fees, responsibilities, odometer, fuel, insurance, cancellation, signatures. <https://www.templateroller.com/template/1999739/vehicle-rental-agreement-template.html>
- FTC consumer guidance on rental cars: coverage options, CDW/LDW, extra charges, additional drivers, card holds, and exclusions for reckless or unauthorized use. <https://consumer.ftc.gov/node/78349>
- Cornell Wex definition of collision damage waiver: CDW limits some renter liability for rental vehicle damage and can have exclusions. <https://www.law.cornell.edu/wex/collision_damage_waiver>
- Motorcycle rental template guidance: bike VIN/plate/engine size, rider eligibility, helmet/gear rules, no racing/off-road use, insurance, accident procedure, damage charges. <https://ailawyer.pro/templates/motorcycle-rental-agreement-template>

## Recommended Print Structure

Use a plain A4 contract. Keep page 1 focused on prefilled facts and signatures. Use page 2 for terms, condition checklist, and return acknowledgment if needed.

Recommended sections:

1. Header
   - Company logo/name, address, phone.
   - Contract number, printed date/time, rental status.

2. Customer
   - Full name.
   - Phone.
   - National ID or passport.
   - Driver license number and expiry.
   - Address.

3. Vehicle
   - Type: car or motorcycle.
   - Plate number.
   - Brand, model, year, color.
   - VIN/chassis number when available.
   - Odometer out.
   - Fuel out.
   - Insurance and registration expiry when available.

4. Employee / Shop Representative
   - Issued by employee name.
   - User role or username if useful.
   - Activation date/time.

5. Rental Period and Pricing
   - Start date/time.
   - Expected return date/time.
   - Daily price.
   - Estimated rental days.
   - Deposit required and deposit paid.
   - Paid amount and remaining balance.
   - Late fee per day.

6. Vehicle Condition at Handover
   - Existing damage notes.
   - Fuel and mileage.
   - Accessories: keys, documents, helmet, lock/chain, phone holder, charger, child seat if applicable.
   - Photo/document attachment note: "Condition photos are stored with this rental record."

7. Simple Terms
   - Customer received the vehicle in the listed condition.
   - Customer must return it by the expected return date/time.
   - Customer is responsible for traffic fines, parking fines, tolls, fuel shortage, excess mileage, cleaning, damage, and late charges according to shop policy.
   - Only listed/authorized drivers or riders may operate the vehicle.
   - Vehicle must not be used for racing, towing, off-road driving/riding, illegal activity, hire/ride-share/delivery unless explicitly allowed, or by anyone under influence of alcohol or drugs.
   - Customer must notify the shop immediately after accident, theft, breakdown, warning light, or unsafe condition.
   - Deposit may be held against unpaid amounts, damage, missing accessories, fuel, fines, or late charges.
   - Insurance/CDW terms depend on the selected option and local policy; unauthorized or reckless use may void coverage.

8. Signatures
   - Customer signature and date.
   - Authorized shop representative signature and date.

9. Return Acknowledgment
   - Actual return date/time.
   - Mileage in.
   - Fuel in.
   - Damage/late/fuel charges.
   - Deposit refund/held amount.
   - Customer and employee signatures.

## Dynamic Field Map

Current app fields that can be used immediately:

| Template area | Current source |
| --- | --- |
| Company name | `settings.shopName` |
| Company phone | `settings.shopPhone` |
| Company address | `settings.shopAddress` |
| Contract footer | `settings.contractFooter` |
| Currency | `settings.defaultCurrency` |
| Contract number | `rentals.contractNo` |
| Rental status | `rentals.status` |
| Start date/time | `rentals.startDatetime` |
| Expected return | `rentals.expectedReturnDatetime` |
| Actual return | `rentals.actualReturnDatetime` |
| Daily price | `rentals.dailyPrice` |
| Deposit required | `rentals.depositRequired` |
| Deposit paid | `rentals.depositPaid` |
| Total, paid, remaining | `rentals.totalAmount`, `rentals.paidAmount`, `rentals.remainingAmount` |
| Mileage out/in | `rentals.mileageOut`, `rentals.mileageIn` |
| Fuel out/in | `rentals.fuelOut`, `rentals.fuelIn` |
| Handover notes | `rentals.notesOut` |
| Return notes/damage | `rentals.notesIn`, `rentals.damageNotes` |
| Customer name | `customers.fullName` |
| Customer phone | `customers.phone` |
| Customer ID | `customers.nationalId` |
| Driver license | `customers.driverLicenseNo` |
| License expiry | `customers.licenseExpiryDate` |
| Customer address | `customers.address` |
| Vehicle type | `vehicles.type` |
| Plate | `vehicles.plateNumber` |
| Brand/model/year/color | `vehicles.brand`, `vehicles.model`, `vehicles.year`, `vehicles.color` |
| Current vehicle mileage | `vehicles.mileage` |
| Insurance/registration expiry | `vehicles.insuranceExpiryDate`, `vehicles.registrationExpiryDate` |
| Employee who created/activated | `rentals.createdByUserId`, `rentals.activatedByUserId` joined to `users.fullName` |
| Employee who returned | `rentals.returnedByUserId` joined to `users.fullName` |

Recommended additional fields for a stronger contract:

| Field | Why |
| --- | --- |
| Company registration/license number | Shops often need this on printed contracts. |
| Company tax number | Useful for formal receipts/contracts if required locally. |
| Vehicle VIN/chassis number | Stronger vehicle identification than plate alone. |
| Motorcycle engine size | Common rider eligibility and insurance detail. |
| Included mileage / extra mileage fee | Needed if shop charges by distance. |
| Fuel return policy / refuel fee | Avoids disputes at return. |
| Authorized additional drivers/riders | Needed if someone else may drive. |
| Insurance/CDW option selected | Needed if shop offers waivers or insurance choices. |
| Pickup/return location | Useful even for one local branch. |
| Accessory checklist | Useful for motorcycles and add-ons. |

## Implementation Notes

- Join `users` twice in `printRentalContract`: one alias for `activatedByUserId`, one alias for `createdByUserId`. Display "Issued by" as activated user, falling back to created user.
- Include `vehicles.type` in the print query. If `type === "motorcycle"`, show motorcycle-specific terms: valid motorcycle license/endorsement, helmet/gear compliance, no racing/stunts/off-road, use lock/chain when parked.
- Keep `settings.contractFooter` for shop-editable legal text, but render a fixed short "Key Terms" section above it so the contract is useful even when settings are empty.
- Keep the generated contract HTML escaped with `escapeHtml`, and use `ltrHtml` for plate numbers, contract numbers, phone numbers, dates, and money in Arabic layouts.
- Use A4 output, readable 12-14px print text, simple tables, and page breaks only between the main contract and longer terms/return acknowledgment.
- Do not save generated PDFs inside the project directory. Let the user choose an export location, or save future automatic copies under Electron `app.getPath("userData")`.

## Draft Template Copy

### Vehicle Rental Contract

Contract No: `{{contract.contractNo}}`

Printed At: `{{printedAt}}`

Status: `{{rental.status}}`

Company:

- Name: `{{company.shopName}}`
- Address: `{{company.shopAddress}}`
- Phone: `{{company.shopPhone}}`
- Registration No: `{{company.registrationNo}}`
- Tax No: `{{company.taxNo}}`

Customer:

- Full Name: `{{customer.fullName}}`
- Phone: `{{customer.phone}}`
- ID / Passport No: `{{customer.nationalId}}`
- Driver License No: `{{customer.driverLicenseNo}}`
- License Expiry: `{{customer.licenseExpiryDate}}`
- Address: `{{customer.address}}`

Vehicle:

- Type: `{{vehicle.type}}`
- Plate No: `{{vehicle.plateNumber}}`
- Brand / Model: `{{vehicle.brand}} {{vehicle.model}}`
- Year / Color: `{{vehicle.year}} / {{vehicle.color}}`
- VIN / Chassis No: `{{vehicle.vin}}`
- Odometer Out: `{{rental.mileageOut}}`
- Fuel Out: `{{rental.fuelOut}}`

Rental Details:

- Start: `{{rental.startDatetime}}`
- Expected Return: `{{rental.expectedReturnDatetime}}`
- Daily Price: `{{rental.dailyPrice}}`
- Estimated Days: `{{rental.estimatedDays}}`
- Deposit Required: `{{rental.depositRequired}}`
- Deposit Paid: `{{rental.depositPaid}}`
- Total Amount: `{{rental.totalAmount}}`
- Paid Amount: `{{rental.paidAmount}}`
- Remaining Balance: `{{rental.remainingAmount}}`

Issued By:

- Employee: `{{employee.issuedByName}}`
- Username / Role: `{{employee.issuedByUsername}} / {{employee.issuedByRole}}`

Condition at Handover:

- Existing damage / notes: `{{rental.notesOut}}`
- Accessories provided: `{{rental.accessoriesOut}}`
- Condition photos: `{{rental.conditionPhotosNote}}`

Key Terms:

1. The customer received the vehicle in the condition shown above and agrees to return it in the same condition, except for normal use.
2. The customer must return the vehicle by the expected return date/time shown in this contract.
3. Late return, missing fuel, excess mileage, cleaning, damage, missing accessories, fines, tolls, and unpaid balances may be charged to the customer.
4. Only the customer and authorized listed drivers/riders may operate the vehicle.
5. The vehicle may not be used for racing, stunts, off-road use, towing, illegal activity, paid hire, ride-share, or delivery unless the shop explicitly allows it in writing.
6. The customer must not operate the vehicle under the influence of alcohol, drugs, or any impairing substance.
7. The customer must contact the shop immediately for accident, theft, breakdown, warning light, unsafe condition, or police involvement.
8. The deposit may be applied to unpaid rent, late fees, damage, fuel, cleaning, missing accessories, fines, or other amounts owed under this contract.
9. Insurance or waiver coverage, if any, applies only according to the selected policy and local law. Unauthorized, reckless, illegal, or impaired use may void coverage.
10. Any change to this contract must be approved by the shop and recorded in writing.

Motorcycle Additional Terms:

1. The rider must hold a valid motorcycle license or endorsement suitable for this motorcycle.
2. The rider and passenger must follow helmet and safety gear laws.
3. Racing, stunts, competitions, and off-road riding are not allowed.
4. The motorcycle must be locked/secured when parked.
5. The rider must stop riding immediately if the motorcycle feels unsafe or a warning light appears.

Signatures:

Customer Name: `{{customer.fullName}}`

Customer Signature: ______________________ Date: _______________

Authorized Shop Representative: `{{employee.issuedByName}}`

Representative Signature: ________________ Date: _______________

### Return Acknowledgment

Actual Return: `{{rental.actualReturnDatetime}}`

Mileage In: `{{rental.mileageIn}}`

Fuel In: `{{rental.fuelIn}}`

Damage / Return Notes: `{{rental.damageNotes}} {{rental.notesIn}}`

Extra Charges: `{{rental.extraCharges}}`

Discount: `{{rental.discount}}`

Final Total: `{{rental.totalAmount}}`

Remaining Balance: `{{rental.remainingAmount}}`

Deposit Refunded / Held: `{{return.depositRefunded}} / {{return.depositHeld}}`

Customer Signature: ______________________ Date: _______________

Employee Signature: ______________________ Date: _______________
