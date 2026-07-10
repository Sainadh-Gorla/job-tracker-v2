import { useEffect, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'

export function useJobs() {
  const { currentUser } = useAuth()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!currentUser) {
      setJobs([])
      setLoading(false)
      return
    }

    setLoading(true)
    const q = query(
      collection(db, 'users', currentUser.uid, 'jobs'),
      orderBy('createdAt', 'desc'),
    )

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setJobs(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      },
    )

    return unsubscribe
  }, [currentUser])

  async function addJob(job) {
    await addDoc(collection(db, 'users', currentUser.uid, 'jobs'), {
      ...job,
      createdAt: serverTimestamp(),
    })
  }

  async function updateJob(id, updates) {
    await updateDoc(doc(db, 'users', currentUser.uid, 'jobs', id), updates)
  }

  async function deleteJob(id) {
    await deleteDoc(doc(db, 'users', currentUser.uid, 'jobs', id))
  }

  return { jobs, loading, error, addJob, updateJob, deleteJob }
}
