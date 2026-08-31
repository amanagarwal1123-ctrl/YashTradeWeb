import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

export const API_BASE = `${BACKEND_URL}/api`;

export function errMsg(error, fallback = "Something went wrong. Please try again.") {
  return error?.response?.data?.detail || fallback;
}
