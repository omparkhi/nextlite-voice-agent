# Medicare Multi-Specialty Clinic — Doctors and OPD Schedule

## 1. Clinic Identification
- **Clinic:** Medicare Multi-Specialty Clinic
- **Address:** 214, Shankar Nagar Main Road, Shankar Nagar, Nagpur, Maharashtra 440010
- **Reception:** +91 70000 12345
- **Appointment Desk:** +91 70000 12346

---

## 2. Master OPD Doctor Roster & Schedule Table

| Doctor Name | Department / Specialty | Qualification | Room No. | OPD Consultation Days | OPD Timings |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Dr. Rohan Sharma** | Cardiology | MD, Cardiology | Room 201 | Monday – Friday | 10:00 AM – 2:00 PM |
| **Dr. Meera Verma** | Orthopedics | MS, Orthopedics | Room 202 | Tuesday, Thursday, Saturday | 3:00 PM – 7:00 PM |
| **Dr. Ananya Roy** | Dental | BDS | Room 203 | Monday – Saturday | 10:00 AM – 6:00 PM |
| **Dr. Kunal Joshi** | General Medicine | MD, General Medicine | Room 204 | Monday – Saturday | Morning: 9:30 AM – 1:00 PM<br>Evening: 4:00 PM – 7:00 PM |
| **Dr. Neha Kulkarni** | Pediatrics (Child Health) | MD, Pediatrics | Room 205 | Monday, Wednesday, Friday | 11:00 AM – 3:00 PM |
| **Dr. Priya Deshmukh** | Dermatology (Skin & Hair) | MD, Dermatology | Room 206 | Monday, Wednesday, Saturday | 2:00 PM – 5:00 PM |

---

## 3. Department to Doctor Mapping
- **General Medicine:** Dr. Kunal Joshi (MD, General Medicine) — Room 204
- **Cardiology:** Dr. Rohan Sharma (MD, Cardiology) — Room 201
- **Orthopedics:** Dr. Meera Verma (MS, Orthopedics) — Room 202
- **Dental:** Dr. Ananya Roy (BDS) — Room 203
- **Pediatrics:** Dr. Neha Kulkarni (MD, Pediatrics) — Room 205
- **Dermatology:** Dr. Priya Deshmukh (MD, Dermatology) — Room 206

---

## 4. Detailed Doctor Profiles & Availability

### 1. Dr. Rohan Sharma — Cardiology
- **Specialty:** Cardiology (Heart & Cardiovascular Health)
- **Qualification:** MD, Cardiology
- **Consultation Room:** Room 201 (Second Floor)
- **Available Days:** Monday, Tuesday, Wednesday, Thursday, Friday (Monday through Friday)
- **OPD Timings:** 10:00 AM to 2:00 PM
- **Unavailable Days:** Saturday and Sunday (Dr. Rohan Sharma has no Saturday or Sunday OPD).

### 2. Dr. Meera Verma — Orthopedics
- **Specialty:** Orthopedics (Bones, Joints, Fractures, Spine)
- **Qualification:** MS, Orthopedics
- **Consultation Room:** Room 202 (Second Floor)
- **Available Days:** Tuesday, Thursday, Saturday
- **OPD Timings:** 3:00 PM to 7:00 PM
- **Unavailable Days:** Monday, Wednesday, Friday, and Sunday.

### 3. Dr. Ananya Roy — Dental
- **Specialty:** Dental Surgery & Oral Health
- **Qualification:** BDS
- **Consultation Room:** Room 203 (Second Floor)
- **Available Days:** Monday through Saturday (Monday, Tuesday, Wednesday, Thursday, Friday, Saturday)
- **OPD Timings:** 10:00 AM to 6:00 PM
- **Unavailable Days:** Sunday.

### 4. Dr. Kunal Joshi — General Medicine
- **Specialty:** General Medicine (Internal Medicine / Primary Care)
- **Qualification:** MD, General Medicine
- **Consultation Room:** Room 204 (Second Floor)
- **Available Days:** Monday through Saturday (Monday, Tuesday, Wednesday, Thursday, Friday, Saturday)
- **OPD Timings:**
  - Morning Session: 9:30 AM to 1:00 PM
  - Evening Session: 4:00 PM to 7:00 PM
- **Unavailable Days:** Sunday.

### 5. Dr. Neha Kulkarni — Pediatrics
- **Specialty:** Pediatrics (Infant, Child, and Adolescent Health)
- **Qualification:** MD, Pediatrics
- **Consultation Room:** Room 205 (Second Floor)
- **Available Days:** Monday, Wednesday, Friday
- **OPD Timings:** 11:00 AM to 3:00 PM
- **Unavailable Days:** Tuesday, Thursday, Saturday, and Sunday.

### 6. Dr. Priya Deshmukh — Dermatology
- **Specialty:** Dermatology (Skin, Hair, and Nails)
- **Qualification:** MD, Dermatology
- **Consultation Room:** Room 206 (Second Floor)
- **Available Days:** Monday, Wednesday, Saturday
- **OPD Timings:** 2:00 PM to 5:00 PM
- **Unavailable Days:** Tuesday, Thursday, Friday, and Sunday.

---

## 5. Doctor Schedule & Booking Rules
1. **Strict Schedule Adherence:** The AI receptionist must never invent, assume, or extrapolate a doctor's schedule or availability.
2. **Unlisted Days / Slots:** If a caller asks for a day or time slot not explicitly listed in the roster above, the AI must state that the doctor is not available at that time based on the clinic schedule.
3. **No Unconfirmed Bookings:** The AI receptionist must not claim that an appointment is booked or confirmed unless an actual booking tool has successfully returned confirmation.
4. **Information Provision:** The AI receptionist can provide exact doctor names, qualifications, consultation rooms, OPD days, and OPD hours.
5. **Sunday Consultations:** No doctors conduct routine OPD consultations on Sunday.

---

## 6. Doctor & OPD Schedule Q&A (RAG Retrieval Prompts)

### Q: When does Dr. Rohan Sharma see patients?
**A:** Dr. Rohan Sharma (Cardiology) is available Monday through Friday from 10:00 AM to 2:00 PM in Room 201.

### Q: Which doctor handles orthopedics?
**A:** Dr. Meera Verma (MS, Orthopedics) handles orthopedics in Room 202 on Tuesday, Thursday, and Saturday from 3:00 PM to 7:00 PM.

### Q: Who is the dental doctor at Medicare Clinic?
**A:** Dr. Ananya Roy (BDS) is the dental surgeon, available in Room 203 Monday through Saturday from 10:00 AM to 6:00 PM.

### Q: What is the cardiology OPD timing?
**A:** Cardiology OPD with Dr. Rohan Sharma is held Monday through Friday from 10:00 AM to 2:00 PM in Room 201.

### Q: What room is Dr. Meera Verma in?
**A:** Dr. Meera Verma is located in Room 202 on the second floor.

### Q: Is Dr. Neha Kulkarni available on Friday?
**A:** Yes, Dr. Neha Kulkarni (Pediatrics) is available on Friday from 11:00 AM to 3:00 PM in Room 205.

### Q: Does Dr. Rohan Sharma have OPD on Saturday or Sunday?
**A:** No, Dr. Rohan Sharma conducts OPD only from Monday to Friday (10:00 AM – 2:00 PM). He is not available on Saturday or Sunday.

### Q: What are the timings for General Medicine with Dr. Kunal Joshi?
**A:** Dr. Kunal Joshi is available Monday to Saturday in two sessions: Morning from 9:30 AM to 1:00 PM, and Evening from 4:00 PM to 7:00 PM in Room 204.

### Q: On which days is dermatologist Dr. Priya Deshmukh available?
**A:** Dr. Priya Deshmukh is available on Monday, Wednesday, and Saturday from 2:00 PM to 5:00 PM in Room 206.
