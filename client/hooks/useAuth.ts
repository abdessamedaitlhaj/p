import {useContext} from 'react'
import { UserContext } from '@/context/Context'

export const useAuth = () => {
	return useContext(UserContext)
}
