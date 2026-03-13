import { useState } from "react";
import { JOB_CATEGORIES } from "../../../lib/constants";

const initialState = {
  title: "",
  description: "",
  required_skill: "",
  category: "Others",
  salary_php: "",
  location: ""
};

export function PostJobForm({ initialValues, onSubmit, submitting, submitLabel = "Post Job" }) {
  const [form, setForm] = useState(initialValues || initialState);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    setAttemptedSubmit(true);
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      return;
    }
    onSubmit({
      ...form,
      salary_php: Number(form.salary_php)
    });
  }

  return (
    <form className={`card form-grid ${attemptedSubmit ? "show-validation" : ""}`} onSubmit={handleSubmit} noValidate>
      <label>
        Job Title
        <input name="title" value={form.title} onChange={handleChange} required />
      </label>
      <label>
        Job Description
        <textarea
          name="description"
          rows={4}
          value={form.description}
          onChange={handleChange}
          required
        />
      </label>
      <label>
        Required Expertise / Skill
        <input name="required_skill" value={form.required_skill} onChange={handleChange} required />
      </label>
      <label>
        Category
        <select name="category" value={form.category} onChange={handleChange}>
          {JOB_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </label>
      <label>
        Salary Offer (PHP)
        <input
          name="salary_php"
          type="number"
          min="0"
          value={form.salary_php}
          onChange={handleChange}
          required
        />
      </label>
      <label>
        Location
        <input name="location" value={form.location} onChange={handleChange} required />
      </label>
      <button className="btn btn-primary" type="submit" disabled={submitting}>
        {submitting ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
